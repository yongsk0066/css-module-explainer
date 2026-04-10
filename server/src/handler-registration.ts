import type { Connection, TextDocumentPositionParams } from "vscode-languageserver/node";
import { FileChangeType, type DidChangeWatchedFilesParams } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextDocuments } from "vscode-languageserver/node";
import { handleCodeAction } from "./providers/code-actions";
import { handleCompletion } from "./providers/completion";
import { handleDefinition } from "./providers/definition";
import { computeDiagnostics } from "./providers/diagnostics";
import { handleHover } from "./providers/hover";
import { handleCodeLens } from "./providers/reference-lens";
import { handleReferences } from "./providers/references";
import type { CursorParams, ProviderDeps } from "./providers/cursor-dispatch";
import { fileUrlToPath } from "./core/util/text-utils";
import type { StyleIndexCache } from "./core/scss/scss-index";
import type { IndexerWorker } from "./core/indexing/indexer-worker";
import type { FileTask } from "./core/indexing/indexer-worker";

const DIAGNOSTICS_DEBOUNCE_MS = 200;

export interface HandlerContext {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
  getDeps(): ProviderDeps | null;
  getBundle(): { styleIndexCache: StyleIndexCache; indexerWorker: IndexerWorker } | null;
}

export interface HandlerCleanup {
  /** Call from onShutdown to clear timers and stop the indexer. */
  shutdown(): void;
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

  connection.onDefinition((p: TextDocumentPositionParams) => {
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleDefinition(cursor, deps);
  });

  connection.onHover((p: TextDocumentPositionParams) => {
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleHover(cursor, deps);
  });

  connection.onCompletion((p) => {
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
    const deps = getDeps();
    if (!deps) return null;
    return handleReferences(p, deps);
  });

  connection.onCodeLens((p) => {
    const deps = getDeps();
    if (!deps) return null;
    return handleCodeLens(p, deps);
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
      const diagnostics = computeDiagnostics(
        {
          documentUri: uri,
          content: doc.getText(),
          filePath: fileUrlToPath(uri),
          version: doc.version,
        },
        deps,
      );
      connection.sendDiagnostics({ uri, diagnostics });
    }, DIAGNOSTICS_DEBOUNCE_MS);
    diagTimers.set(uri, timer);
  };

  documents.onDidChangeContent((change) => {
    scheduleDiagnostics(change.document.uri);
  });

  documents.onDidClose((change) => {
    const existing = diagTimers.get(change.document.uri);
    if (existing) {
      clearTimeout(existing);
      diagTimers.delete(change.document.uri);
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
