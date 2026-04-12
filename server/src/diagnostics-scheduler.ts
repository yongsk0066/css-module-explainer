import type { Connection } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextDocuments } from "vscode-languageserver/node";
import { DiagnosticSeverity } from "vscode-languageserver/node";
import { computeDiagnostics } from "./providers/diagnostics";
import { computeScssUnusedDiagnostics } from "./providers/scss-diagnostics";
import type { ProviderDeps } from "./providers/provider-deps";
import { fileUrlToPath } from "./core/util/text-utils";
import { findLangForPath } from "./core/scss/lang-registry";
import type { Settings } from "./settings";

const DIAGNOSTICS_DEBOUNCE_MS = 200;

export interface DiagnosticsSchedulerDeps {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
  getDeps(): ProviderDeps | null;
}

export interface DiagnosticsScheduler {
  scheduleTsx(uri: string): void;
  scheduleScss(uri: string): void;
  shutdown(): void;
  refreshSettings(s: Settings): void;
  /** Subscribe to indexer readiness so SCSS diagnostics fire after the initial walk. */
  ensureReadySubscribed(): void;
  /** Cancel pending timers for a closed document and clear its diagnostics. */
  handleDocumentClose(uri: string): void;
}

const SEVERITY_MAP: Record<string, DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  information: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

function parseSeverity(value: string): DiagnosticSeverity {
  return SEVERITY_MAP[value] ?? DiagnosticSeverity.Warning;
}

export function createDiagnosticsScheduler(
  deps: DiagnosticsSchedulerDeps,
  settings: Settings,
): DiagnosticsScheduler {
  return new DiagnosticsSchedulerImpl(deps, settings);
}

/**
 * Encapsulates TSX and SCSS diagnostic debounce/timer logic so
 * that handler-registration stays a thin routing table.
 *
 * The debounce skeleton (cancel existing timer → arm new one) is
 * centralized in `debounce()`; `runTsxDiagnostics` and
 * `runScssDiagnostics` hold only the compute-and-publish bodies.
 */
class DiagnosticsSchedulerImpl implements DiagnosticsScheduler {
  private readonly tsxTimers = new Map<string, NodeJS.Timeout>();
  private readonly scssTimers = new Map<string, NodeJS.Timeout>();
  private currentSettings: Settings;
  private indexReady = false;
  private readySubscribed = false;

  constructor(
    private readonly deps: DiagnosticsSchedulerDeps,
    settings: Settings,
  ) {
    this.currentSettings = settings;
  }

  scheduleTsx(uri: string): void {
    this.debounce(this.tsxTimers, uri, () => this.runTsxDiagnostics(uri));
  }

  scheduleScss(uri: string): void {
    this.ensureReadySubscribed();
    if (!this.indexReady) return;
    if (!this.currentSettings.diagnostics.unusedSelector) return;
    this.debounce(this.scssTimers, uri, () => this.runScssDiagnostics(uri));
  }

  shutdown(): void {
    clearAll(this.tsxTimers);
    clearAll(this.scssTimers);
  }

  refreshSettings(s: Settings): void {
    this.currentSettings = s;
  }

  ensureReadySubscribed(): void {
    if (this.readySubscribed) return;
    const providerDeps = this.deps.getDeps();
    if (!providerDeps) return;
    this.readySubscribed = true;
    providerDeps.indexerReady
      .then(() => {
        this.indexReady = true;
        for (const doc of this.deps.documents.all()) {
          if (findLangForPath(fileUrlToPath(doc.uri))) {
            this.scheduleScss(doc.uri);
          }
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.connection.console.error(
          `[css-module-explainer] indexer readiness failed: ${message}`,
        );
      });
  }

  handleDocumentClose(uri: string): void {
    cancelTimer(this.tsxTimers, uri);
    cancelTimer(this.scssTimers, uri);
    this.deps.connection.sendDiagnostics({ uri, diagnostics: [] });
  }

  private debounce(timers: Map<string, NodeJS.Timeout>, uri: string, run: () => void): void {
    const existing = timers.get(uri);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.delete(uri);
      run();
    }, DIAGNOSTICS_DEBOUNCE_MS);
    timers.set(uri, timer);
  }

  private runTsxDiagnostics(uri: string): void {
    const providerDeps = this.deps.getDeps();
    const doc = this.deps.documents.get(uri);
    if (!providerDeps || !doc) return;
    const severity = parseSeverity(this.currentSettings.diagnostics.severity);
    const diagnostics = computeDiagnostics(
      {
        documentUri: uri,
        content: doc.getText(),
        filePath: fileUrlToPath(uri),
        version: doc.version,
      },
      providerDeps,
      severity,
    );
    this.deps.connection.sendDiagnostics({ uri, diagnostics });
  }

  private runScssDiagnostics(uri: string): void {
    const providerDeps = this.deps.getDeps();
    const doc = this.deps.documents.get(uri);
    if (!providerDeps || !doc) return;
    const filePath = fileUrlToPath(uri);
    const classMap = providerDeps.scssClassMapForPath(filePath);
    if (!classMap) return;
    const diagnostics = computeScssUnusedDiagnostics(
      filePath,
      classMap,
      providerDeps.reverseIndex,
      providerDeps.semanticReferenceIndex,
    );
    this.deps.connection.sendDiagnostics({ uri, diagnostics });
  }
}

function cancelTimer(timers: Map<string, NodeJS.Timeout>, uri: string): void {
  const existing = timers.get(uri);
  if (existing) {
    clearTimeout(existing);
    timers.delete(uri);
  }
}

function clearAll(timers: Map<string, NodeJS.Timeout>): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
