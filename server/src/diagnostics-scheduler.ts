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

/**
 * Encapsulates TSX and SCSS diagnostic debounce/timer logic.
 *
 * Extracted from `registerHandlers` so that handler-registration
 * stays a thin routing table.
 */
export function createDiagnosticsScheduler(
  deps: DiagnosticsSchedulerDeps,
  settings: Settings,
): DiagnosticsScheduler {
  const { connection, documents, getDeps } = deps;

  let currentSettings = settings;

  const diagTimers = new Map<string, NodeJS.Timeout>();
  const scssDiagTimers = new Map<string, NodeJS.Timeout>();
  let indexReady = false;
  let readySubscribed = false;

  const scheduleTsx = (uri: string): void => {
    const existing = diagTimers.get(uri);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const providerDeps = getDeps();
      const doc = documents.get(uri);
      diagTimers.delete(uri);
      if (!providerDeps || !doc) return;
      const severity = parseSeverity(currentSettings.diagnostics.severity);
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
      connection.sendDiagnostics({ uri, diagnostics });
    }, DIAGNOSTICS_DEBOUNCE_MS);
    diagTimers.set(uri, timer);
  };

  function ensureReadySubscribed(): void {
    if (readySubscribed) return;
    const providerDeps = getDeps();
    if (!providerDeps) return;
    readySubscribed = true;
    providerDeps.indexerReady
      .then(() => {
        indexReady = true;
        for (const doc of documents.all()) {
          const filePath = fileUrlToPath(doc.uri);
          if (findLangForPath(filePath)) {
            scheduleScss(doc.uri);
          }
        }
      })
      .catch((err: unknown) => {
        connection.console.error(
          `[css-module-explainer] indexer readiness failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  const scheduleScss = (uri: string): void => {
    ensureReadySubscribed();
    if (!indexReady) return;
    if (!currentSettings.diagnostics.unusedSelector) return;
    const existing = scssDiagTimers.get(uri);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const providerDeps = getDeps();
      const doc = documents.get(uri);
      scssDiagTimers.delete(uri);
      if (!providerDeps || !doc) return;
      const filePath = fileUrlToPath(uri);
      const classMap = providerDeps.scssClassMapForPath(filePath);
      if (!classMap) return;
      const diagnostics = computeScssUnusedDiagnostics(
        filePath,
        classMap,
        providerDeps.reverseIndex,
      );
      connection.sendDiagnostics({ uri, diagnostics });
    }, DIAGNOSTICS_DEBOUNCE_MS);
    scssDiagTimers.set(uri, timer);
  };

  const handleDocumentClose = (uri: string): void => {
    const existing = diagTimers.get(uri);
    if (existing) {
      clearTimeout(existing);
      diagTimers.delete(uri);
    }
    const scssTimer = scssDiagTimers.get(uri);
    if (scssTimer) {
      clearTimeout(scssTimer);
      scssDiagTimers.delete(uri);
    }
    connection.sendDiagnostics({ uri, diagnostics: [] });
  };

  const shutdown = (): void => {
    for (const timer of diagTimers.values()) clearTimeout(timer);
    diagTimers.clear();
    for (const timer of scssDiagTimers.values()) clearTimeout(timer);
    scssDiagTimers.clear();
  };

  const refreshSettings = (s: Settings): void => {
    currentSettings = s;
  };

  return {
    scheduleTsx,
    scheduleScss,
    shutdown,
    refreshSettings,
    ensureReadySubscribed,
    handleDocumentClose,
  };
}
