import type { Connection, TextDocumentPositionParams } from "vscode-languageserver/node";
import {
  DiagnosticSeverity,
  FileChangeType,
  type DidChangeWatchedFilesParams,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextDocuments } from "vscode-languageserver/node";
import { handleCodeAction } from "./providers/code-actions";
import { handleCompletion } from "./providers/completion";
import { handleDefinition } from "./providers/definition";
import { computeDiagnostics } from "./providers/diagnostics";
import { handleHover } from "./providers/hover";
import { handleCodeLens } from "./providers/reference-lens";
import { handleReferences } from "./providers/references";
import { handlePrepareRename, handleRename } from "./providers/rename";
import { computeScssUnusedDiagnostics } from "./providers/scss-diagnostics";
import type { CursorParams, ProviderDeps } from "./providers/cursor-dispatch";
import { fileUrlToPath } from "./core/util/text-utils";
import { findLangForPath } from "./core/scss/lang-registry";
import type { StyleIndexCache } from "./core/scss/scss-index";
import type { IndexerWorker } from "./core/indexing/indexer-worker";
import type { FileTask } from "./core/indexing/indexer-worker";
import { fetchSettings, DEFAULT_SETTINGS, type Settings } from "./settings";

const DIAGNOSTICS_DEBOUNCE_MS = 200;

export interface HandlerContext {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
  getDeps(): ProviderDeps | null;
  getBundle(): { styleIndexCache: StyleIndexCache; indexerWorker: IndexerWorker } | null;
}

export interface HandlerCleanup {
  shutdown(): void;
  refreshSettings(): void;
}

/**
 * Wire every LSP request/notification handler onto the connection.
 *
 * Separated from the composition root so createServer stays a
 * thin DI shell and this file owns the "what happens when VS Code
 * sends a request" routing table.
 *
 * Returns a cleanup handle so the composition root's single
 * `onShutdown` handler can invoke timer + indexer cleanup.
 */
export function registerHandlers(ctx: HandlerContext): HandlerCleanup {
  const { connection, documents, getDeps, getBundle } = ctx;

  let settings: Settings = DEFAULT_SETTINGS;

  connection.onDidChangeConfiguration(() => {
    fetchSettings(connection)
      .then((s) => {
        settings = s;
      })
      .catch(() => {});
  });

  connection.onDefinition((p: TextDocumentPositionParams) => {
    if (!settings.features.definition) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleDefinition(cursor, deps);
  });

  connection.onHover((p: TextDocumentPositionParams) => {
    if (!settings.features.hover) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleHover(cursor, deps, settings.hover.maxCandidates);
  });

  connection.onCompletion((p) => {
    if (!settings.features.completion) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleCompletion(cursor, deps);
  });

  connection.onCodeAction((p) => {
    const deps = getDeps();
    if (!deps) return null;
    return handleCodeAction(p, deps);
  });

  connection.onReferences((p) => {
    if (!settings.features.references) return null;
    const deps = getDeps();
    if (!deps) return null;
    return handleReferences(p, deps);
  });

  connection.onCodeLens((p) => {
    if (!settings.features.references) return null;
    const deps = getDeps();
    if (!deps) return null;
    return handleCodeLens(p, deps);
  });

  connection.onPrepareRename((p) => {
    if (!settings.features.rename) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    return handlePrepareRename(p, deps, cursor ?? undefined);
  });

  connection.onRenameRequest((p) => {
    if (!settings.features.rename) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    return handleRename(p, deps, cursor ?? undefined);
  });

  const diagTimers = new Map<string, NodeJS.Timeout>();

  const scheduleDiagnostics = (uri: string): void => {
    const existing = diagTimers.get(uri);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const deps = getDeps();
      const doc = documents.get(uri);
      diagTimers.delete(uri);
      if (!deps || !doc) return;
      const severity = parseSeverity(settings.diagnostics.severity);
      const diagnostics = computeDiagnostics(
        {
          documentUri: uri,
          content: doc.getText(),
          filePath: fileUrlToPath(uri),
          version: doc.version,
        },
        deps,
        severity,
      );
      connection.sendDiagnostics({ uri, diagnostics });
    }, DIAGNOSTICS_DEBOUNCE_MS);
    diagTimers.set(uri, timer);
  };

  // ── SCSS unused-selector diagnostics ────────────────────────

  let indexReady = false;
  let readySubscribed = false;

  function ensureReadySubscribed(): void {
    if (readySubscribed) return;
    const bundle = getBundle();
    if (!bundle) return;
    readySubscribed = true;
    bundle.indexerWorker.ready.then(() => {
      indexReady = true;
      // Re-trigger SCSS diagnostics for all open SCSS documents.
      for (const doc of documents.all()) {
        const filePath = fileUrlToPath(doc.uri);
        if (findLangForPath(filePath)) {
          scheduleSccssDiagnostics(doc.uri);
        }
      }
    });
  }

  const scssDiagTimers = new Map<string, NodeJS.Timeout>();

  const scheduleSccssDiagnostics = (uri: string): void => {
    ensureReadySubscribed();
    if (!indexReady) return; // Gate: do not diagnose before index walk finishes.
    if (!settings.diagnostics.unusedSelector) return; // Gate: setting from Task 4.
    const existing = scssDiagTimers.get(uri);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const deps = getDeps();
      const doc = documents.get(uri);
      scssDiagTimers.delete(uri);
      if (!deps || !doc) return;
      const filePath = fileUrlToPath(uri);
      const classMap = deps.scssClassMapForPath(filePath);
      if (!classMap) return;
      const diagnostics = computeScssUnusedDiagnostics(filePath, classMap, deps.reverseIndex);
      connection.sendDiagnostics({ uri, diagnostics });
    }, DIAGNOSTICS_DEBOUNCE_MS);
    scssDiagTimers.set(uri, timer);
  };

  documents.onDidChangeContent((change) => {
    ensureReadySubscribed();
    const filePath = fileUrlToPath(change.document.uri);
    if (findLangForPath(filePath)) {
      scheduleSccssDiagnostics(change.document.uri);
    } else {
      scheduleDiagnostics(change.document.uri);
    }
  });

  documents.onDidClose((change) => {
    const existing = diagTimers.get(change.document.uri);
    if (existing) {
      clearTimeout(existing);
      diagTimers.delete(change.document.uri);
    }
    const scssTimer = scssDiagTimers.get(change.document.uri);
    if (scssTimer) {
      clearTimeout(scssTimer);
      scssDiagTimers.delete(change.document.uri);
    }
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
  });

  connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
    const bundle = getBundle();
    if (!bundle) return;
    for (const change of params.changes) {
      const filePath = fileUrlToPath(change.uri);
      if (change.type === FileChangeType.Deleted) {
        bundle.styleIndexCache.invalidate(filePath);
        continue;
      }
      bundle.styleIndexCache.invalidate(filePath);
      const task: FileTask = { kind: "scss", path: filePath };
      bundle.indexerWorker.pushFile(task);
    }
    for (const doc of documents.all()) {
      scheduleDiagnostics(doc.uri);
    }
  });

  return {
    shutdown() {
      const bundle = getBundle();
      bundle?.indexerWorker.stop();
      for (const timer of diagTimers.values()) clearTimeout(timer);
      diagTimers.clear();
      for (const timer of scssDiagTimers.values()) clearTimeout(timer);
      scssDiagTimers.clear();
    },
    refreshSettings() {
      fetchSettings(connection)
        .then((s) => {
          settings = s;
        })
        .catch(() => {});
    },
  };
}

function toCursorParams(
  p: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>,
): CursorParams | null {
  const doc = documents.get(p.textDocument.uri);
  if (!doc) return null;
  return {
    documentUri: p.textDocument.uri,
    content: doc.getText(),
    filePath: fileUrlToPath(p.textDocument.uri),
    line: p.position.line,
    character: p.position.character,
    version: doc.version,
  };
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
