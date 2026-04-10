import type { Connection, TextDocumentPositionParams } from "vscode-languageserver/node";
import { FileChangeType, type DidChangeWatchedFilesParams } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextDocuments } from "vscode-languageserver/node";
import { handleCodeAction } from "./providers/code-actions";
import { handleCompletion } from "./providers/completion";
import { handleDefinition } from "./providers/definition";
import { handleHover } from "./providers/hover";
import { handleCodeLens } from "./providers/reference-lens";
import { handleReferences } from "./providers/references";
import { handlePrepareRename, handleRename } from "./providers/rename";
import type { CursorParams, ProviderDeps } from "./providers/cursor-dispatch";
import { fileUrlToPath } from "./core/util/text-utils";
import { findLangForPath } from "./core/scss/lang-registry";
import type { StyleIndexCache } from "./core/scss/scss-index";
import type { IndexerWorker } from "./core/indexing/indexer-worker";
import type { FileTask } from "./core/indexing/indexer-worker";
import { fetchSettings, DEFAULT_SETTINGS, type Settings } from "./settings";
import { createDiagnosticsScheduler } from "./diagnostics-scheduler";

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

  const scheduler = createDiagnosticsScheduler(
    { connection, documents, getDeps, getBundle },
    settings,
  );

  connection.onDidChangeConfiguration(() => {
    fetchSettings(connection)
      .then((s) => {
        settings = s;
        scheduler.refreshSettings(s);
      })
      .catch((err: unknown) => {
        try {
          connection.console.error(
            `[css-module-explainer] settings fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        } catch {
          // Connection already disposed — nothing to log to.
        }
      });
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

  documents.onDidChangeContent((change) => {
    scheduler.ensureReadySubscribed();
    const filePath = fileUrlToPath(change.document.uri);
    if (findLangForPath(filePath)) {
      scheduler.scheduleScss(change.document.uri);
    } else {
      scheduler.scheduleTsx(change.document.uri);
    }
  });

  documents.onDidClose((change) => {
    scheduler.handleDocumentClose(change.document.uri);
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
      scheduler.scheduleTsx(doc.uri);
    }
  });

  return {
    shutdown() {
      const bundle = getBundle();
      bundle?.indexerWorker.stop();
      scheduler.shutdown();
    },
    refreshSettings() {
      fetchSettings(connection)
        .then((s) => {
          settings = s;
          scheduler.refreshSettings(s);
        })
        .catch((err: unknown) => {
          try {
            connection.console.error(
              `[css-module-explainer] settings fetch failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          } catch {
            // Connection already disposed — nothing to log to.
          }
        });
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
