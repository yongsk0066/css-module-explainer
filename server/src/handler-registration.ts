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
import type { CursorParams, ProviderDeps } from "./providers/provider-deps";
import { fileUrlToPath } from "./core/util/text-utils";
import { findLangForPath } from "./core/scss/lang-registry";
import { fetchSettings, DEFAULT_SETTINGS, type Settings } from "./settings";
import { createDiagnosticsScheduler, type DiagnosticsScheduler } from "./diagnostics-scheduler";

export interface HandlerContext {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
  getDeps(): ProviderDeps | null;
}

export interface HandlerCleanup {
  shutdown(): void;
  refreshSettings(): void;
}

interface HandlerState {
  readonly ctx: HandlerContext;
  readonly scheduler: DiagnosticsScheduler;
  settings: Settings;
}

/**
 * Wire every LSP request/notification handler onto the connection.
 *
 * Split into feature-group registrars so this file owns routing
 * only — the composition root stays a thin DI shell.
 */
export function registerHandlers(ctx: HandlerContext): HandlerCleanup {
  const state: HandlerState = {
    ctx,
    scheduler: createDiagnosticsScheduler(ctx, DEFAULT_SETTINGS),
    settings: DEFAULT_SETTINGS,
  };

  const reloadSettings = registerSettingsHandler(state);
  registerCursorHandlers(state);
  registerDocumentHandlers(state);
  registerWatchedFilesHandler(state);

  return {
    shutdown() {
      state.ctx.getDeps()?.stopIndexer();
      state.scheduler.shutdown();
    },
    refreshSettings: reloadSettings,
  };
}

function registerSettingsHandler(state: HandlerState): () => void {
  const { connection } = state.ctx;

  function reloadSettings(): void {
    fetchSettings(connection)
      .then((s) => {
        const prev = state.settings;
        state.settings = s;
        state.scheduler.refreshSettings(s);

        const deps = state.ctx.getDeps();
        if (!deps) return;
        deps.settings = s;

        // Per-branch mutators — each owns its specific side effect.
        const aliasChanged = !shallowEqualPathAlias(prev.pathAlias, s.pathAlias);
        const modeChanged = prev.scss.classnameTransform !== s.scss.classnameTransform;
        if (aliasChanged) deps.rebuildAliasResolver(s.pathAlias);
        if (modeChanged) deps.setClassnameTransform(s.scss.classnameTransform);

        // Shared invalidation + reschedule fires once regardless of
        // which branch triggered. Route each open document to the
        // scheduler method that matches its language — sending a
        // SCSS URI through `scheduleTsx` would run TSX class-token
        // validation on the SCSS file and leave the real SCSS
        // unused-selector diagnostic stale under the prior mode.
        if (aliasChanged || modeChanged) {
          deps.analysisCache.clear();
          deps.semanticReferenceIndex.clear();
          for (const doc of state.ctx.documents.all()) {
            const filePath = fileUrlToPath(doc.uri);
            if (findLangForPath(filePath)) {
              state.scheduler.scheduleScss(doc.uri);
            } else {
              state.scheduler.scheduleTsx(doc.uri);
            }
          }
        }
      })
      .catch((err: unknown) => safeLogError(connection, "settings fetch failed", err));
  }

  connection.onDidChangeConfiguration(reloadSettings);
  return reloadSettings;
}

function shallowEqualPathAlias(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function registerCursorHandlers(state: HandlerState): void {
  const { connection, documents, getDeps } = state.ctx;

  const withCursor = <T>(
    featureOn: () => boolean,
    p: TextDocumentPositionParams,
    run: (cursor: CursorParams, deps: ProviderDeps) => T | null,
  ): T | null => {
    if (!featureOn()) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return run(cursor, deps);
  };

  connection.onDefinition((p) =>
    withCursor(() => state.settings.features.definition, p, handleDefinition),
  );

  connection.onHover((p) =>
    withCursor(
      () => state.settings.features.hover,
      p,
      (cursor, deps) => handleHover(cursor, deps, state.settings.hover.maxCandidates),
    ),
  );

  connection.onCompletion((p) =>
    withCursor(() => state.settings.features.completion, p, handleCompletion),
  );

  connection.onCodeAction((p) => {
    const deps = getDeps();
    if (!deps) return null;
    return handleCodeAction(p, deps);
  });

  connection.onReferences((p) => {
    if (!state.settings.features.references) return null;
    const deps = getDeps();
    if (!deps) return null;
    return handleReferences(p, deps);
  });

  connection.onCodeLens((p) => {
    if (!state.settings.features.references) return null;
    const deps = getDeps();
    if (!deps) return null;
    return handleCodeLens(p, deps);
  });

  connection.onPrepareRename((p) => {
    if (!state.settings.features.rename) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    return handlePrepareRename(p, deps, cursor ?? undefined);
  });

  connection.onRenameRequest((p) => {
    if (!state.settings.features.rename) return null;
    const deps = getDeps();
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    return handleRename(p, deps, cursor ?? undefined);
  });
}

function registerDocumentHandlers(state: HandlerState): void {
  const { documents } = state.ctx;

  documents.onDidChangeContent((change) => {
    state.scheduler.ensureReadySubscribed();
    const filePath = fileUrlToPath(change.document.uri);
    if (findLangForPath(filePath)) {
      state.scheduler.scheduleScss(change.document.uri);
    } else {
      state.scheduler.scheduleTsx(change.document.uri);
    }
  });

  documents.onDidClose((change) => {
    state.scheduler.handleDocumentClose(change.document.uri);
    const deps = state.ctx.getDeps();
    if (!deps) return;
    // Drop every workspace-visible trace of the closed buffer
    // before the next analyze or unused-selector check runs.
    deps.semanticReferenceIndex.forget(change.document.uri);
    deps.analysisCache.invalidate(change.document.uri);
  });
}

function registerWatchedFilesHandler(state: HandlerState): void {
  const { connection, documents, getDeps } = state.ctx;

  connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
    const deps = getDeps();
    if (!deps) return;
    let hasStyleChange = false;
    let hasSourceChange = false;
    for (const change of params.changes) {
      const filePath = fileUrlToPath(change.uri);
      if (findLangForPath(filePath)) {
        hasStyleChange = true;
        deps.invalidateStyle(filePath);
        if (change.type !== FileChangeType.Deleted) {
          deps.pushStyleFile(filePath);
        }
        invalidateDependentTsxEntries(deps, filePath);
      } else {
        hasSourceChange = true;
      }
    }
    if (hasSourceChange) {
      deps.typeResolver.invalidate(deps.workspaceRoot);
      // Drop cached analysis for every open source document so
      // `onAnalyze` re-fires on the next `scheduleTsx` and the
      // semantic reference index recomputes with fresh type data.
      // We invalidate all open source docs because
      // `typeResolver.invalidate` drops the entire workspace
      // program — we cannot narrow which documents' symbol-based
      // references are affected.
      for (const doc of documents.all()) {
        if (!findLangForPath(fileUrlToPath(doc.uri))) {
          deps.analysisCache.invalidate(doc.uri);
        }
      }
    }
    if (hasStyleChange || hasSourceChange) {
      for (const doc of documents.all()) {
        const docPath = fileUrlToPath(doc.uri);
        if (findLangForPath(docPath)) {
          state.scheduler.scheduleScss(doc.uri);
        } else {
          state.scheduler.scheduleTsx(doc.uri);
        }
      }
    }
  });
}

/**
 * Invalidate cached TSX analysis entries whose semantic reference
 * contribution depends on this SCSS file. Without this, the
 * debounced scheduleTsx hits `analysisCache.get`, finds the
 * version unchanged, and reuses the stale AnalysisEntry — so
 * `onAnalyze` never re-fires and the semantic reference query
 * keeps serving targets computed against the old classMap.
 */
function invalidateDependentTsxEntries(deps: ProviderDeps, scssPath: string): void {
  const affectedUris = new Set(deps.semanticReferenceIndex.findReferencingUris(scssPath));
  for (const uri of affectedUris) {
    deps.analysisCache.invalidate(uri);
  }
}

function safeLogError(connection: Connection, context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  try {
    connection.console.error(`[css-module-explainer] ${context}: ${message}`);
  } catch {
    // Connection already disposed — nothing to log to.
  }
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
