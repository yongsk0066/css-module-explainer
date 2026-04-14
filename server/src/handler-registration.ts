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
import {
  DEFAULT_WINDOW_SETTINGS,
  fetchResourceSettings,
  fetchWindowSettings,
  mergeSettings,
  type WindowSettings,
} from "./settings";
import { createDiagnosticsScheduler, type DiagnosticsScheduler } from "./diagnostics-scheduler";
import type { WorkspaceRegistry } from "./workspace/workspace-registry";

export interface HandlerContext {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
  getDeps(uri: string): ProviderDeps | null;
  getRegistry(): WorkspaceRegistry | null;
}

export interface HandlerCleanup {
  shutdown(): void;
  refreshSettings(): void;
}

interface HandlerState {
  readonly ctx: HandlerContext;
  readonly scheduler: DiagnosticsScheduler;
  windowSettings: WindowSettings;
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
    scheduler: createDiagnosticsScheduler(
      {
        connection: ctx.connection,
        documents: ctx.documents,
        getDeps: ctx.getDeps,
        getAllDeps: () => ctx.getRegistry()?.allDeps() ?? [],
      },
      DEFAULT_WINDOW_SETTINGS,
    ),
    windowSettings: DEFAULT_WINDOW_SETTINGS,
  };

  const reloadSettings = registerSettingsHandler(state);
  registerCursorHandlers(state);
  registerDocumentHandlers(state);
  registerWatchedFilesHandler(state);

  return {
    shutdown() {
      for (const deps of state.ctx.getRegistry()?.allDeps() ?? []) {
        deps.stopIndexer();
      }
      state.scheduler.shutdown();
    },
    refreshSettings: reloadSettings,
  };
}

function registerSettingsHandler(state: HandlerState): () => void {
  const { connection } = state.ctx;

  function reloadSettings(): void {
    fetchWindowSettings(connection)
      .then(async (windowSettings) => {
        state.windowSettings = windowSettings;
        state.scheduler.refreshSettings(windowSettings);

        const registry = state.ctx.getRegistry();
        if (!registry) return;

        let resourceChanged = false;
        const bundles = registry.allDeps();
        const resourceSettingsByBundle = await Promise.all(
          bundles.map(async (deps) => ({
            deps,
            resourceSettings: await fetchResourceSettings(connection, deps.workspaceFolderUri),
          })),
        );
        for (const { deps, resourceSettings } of resourceSettingsByBundle) {
          const nextSettings = mergeSettings(windowSettings, resourceSettings);
          const prevSettings = deps.settings;
          deps.settings = nextSettings;

          const aliasChanged = !shallowEqualPathAlias(
            prevSettings.pathAlias,
            nextSettings.pathAlias,
          );
          const modeChanged =
            prevSettings.scss.classnameTransform !== nextSettings.scss.classnameTransform;
          if (aliasChanged) deps.rebuildAliasResolver(nextSettings.pathAlias);
          if (aliasChanged || modeChanged) resourceChanged = true;
        }

        if (resourceChanged) {
          for (const deps of bundles) {
            deps.analysisCache.clear();
          }
          bundles[0]?.semanticReferenceIndex.clear();
          bundles[0]?.refreshCodeLens();
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
    const deps = getDeps(p.textDocument.uri);
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return run(cursor, deps);
  };

  connection.onDefinition((p) =>
    withCursor(() => state.windowSettings.features.definition, p, handleDefinition),
  );

  connection.onHover((p) =>
    withCursor(
      () => state.windowSettings.features.hover,
      p,
      (cursor, deps) => handleHover(cursor, deps, state.windowSettings.hover.maxCandidates),
    ),
  );

  connection.onCompletion((p) =>
    withCursor(() => state.windowSettings.features.completion, p, handleCompletion),
  );

  connection.onCodeAction((p) => {
    const deps = getDeps(p.textDocument.uri);
    if (!deps) return null;
    return handleCodeAction(p, deps);
  });

  connection.onReferences((p) => {
    if (!state.windowSettings.features.references) return null;
    const deps = getDeps(p.textDocument.uri);
    if (!deps) return null;
    return handleReferences(p, deps);
  });

  connection.onCodeLens((p) => {
    if (!state.windowSettings.features.references) return null;
    const deps = getDeps(p.textDocument.uri);
    if (!deps) return null;
    return handleCodeLens(p, deps);
  });

  connection.onPrepareRename((p) => {
    if (!state.windowSettings.features.rename) return null;
    const deps = getDeps(p.textDocument.uri);
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    return handlePrepareRename(p, deps, cursor ?? undefined);
  });

  connection.onRenameRequest((p) => {
    if (!state.windowSettings.features.rename) return null;
    const deps = getDeps(p.textDocument.uri);
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
    const deps = state.ctx.getDeps(change.document.uri);
    if (!deps) return;
    // Drop every workspace-visible trace of the closed buffer
    // before the next analyze or unused-selector check runs.
    deps.semanticReferenceIndex.forget(change.document.uri);
    deps.analysisCache.invalidate(change.document.uri);
    deps.refreshCodeLens();
  });
}

function registerWatchedFilesHandler(state: HandlerState): void {
  const { connection, documents } = state.ctx;

  connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
    const registry = state.ctx.getRegistry();
    if (!registry) return;
    let hasStyleChange = false;
    let hasSourceChange = false;
    let hasProjectConfigChange = false;
    const affectedWorkspaceRoots = new Set<string>();
    const affectedSourceUris = new Set<string>();
    for (const change of params.changes) {
      const filePath = fileUrlToPath(change.uri);
      const deps = registry.getDepsForFilePath(filePath);
      if (!deps) continue;
      affectedWorkspaceRoots.add(deps.workspaceRoot);
      if (findLangForPath(filePath)) {
        hasStyleChange = true;
        deps.invalidateStyle(filePath);
        if (change.type !== FileChangeType.Deleted) {
          deps.pushStyleFile(filePath);
        }
        for (const uri of invalidateDependentTsxEntries(
          state.ctx.getDeps,
          deps.semanticReferenceIndex,
          filePath,
        )) {
          affectedSourceUris.add(uri);
        }
      } else {
        hasSourceChange = true;
        if (isProjectConfigPath(filePath)) {
          hasProjectConfigChange = true;
        }
      }
    }
    const affectedDeps = registry
      .allDeps()
      .filter((deps) => affectedWorkspaceRoots.has(deps.workspaceRoot));
    if (hasProjectConfigChange) {
      for (const deps of affectedDeps) {
        deps.rebuildAliasResolver(deps.settings.pathAlias);
      }
    }
    if (hasSourceChange) {
      for (const deps of affectedDeps) {
        deps.typeResolver.invalidate(deps.workspaceRoot);
      }
      for (const doc of documents.all()) {
        const deps = state.ctx.getDeps(doc.uri);
        if (!deps || !affectedWorkspaceRoots.has(deps.workspaceRoot)) continue;
        if (findLangForPath(fileUrlToPath(doc.uri))) continue;
        deps.analysisCache.invalidate(doc.uri);
      }
    }
    if (hasStyleChange || hasSourceChange) {
      for (const doc of documents.all()) {
        const deps = state.ctx.getDeps(doc.uri);
        if (!deps) continue;
        const docPath = fileUrlToPath(doc.uri);
        const rootAffected = affectedWorkspaceRoots.has(deps.workspaceRoot);
        const sourceAffected = affectedSourceUris.has(doc.uri);
        if (!rootAffected && !sourceAffected) continue;
        if (findLangForPath(docPath)) {
          if (!rootAffected) continue;
          state.scheduler.scheduleScss(doc.uri);
        } else {
          if (!rootAffected && !sourceAffected) continue;
          state.scheduler.scheduleTsx(doc.uri);
        }
      }
    }
  });
}

function isProjectConfigPath(filePath: string): boolean {
  const base = filePath.split(/[\\/]/u).pop();
  return (
    base !== undefined && (/^tsconfig.*\.json$/u.test(base) || /^jsconfig.*\.json$/u.test(base))
  );
}

/**
 * Invalidate cached TSX analysis entries whose semantic reference
 * contribution depends on this SCSS file. Without this, the
 * debounced scheduleTsx hits `analysisCache.get`, finds the
 * version unchanged, and reuses the stale AnalysisEntry — so
 * `onAnalyze` never re-fires and the semantic reference query
 * keeps serving targets computed against the old classMap.
 */
function invalidateDependentTsxEntries(
  getDeps: (uri: string) => ProviderDeps | null,
  semanticReferenceIndex: ProviderDeps["semanticReferenceIndex"],
  scssPath: string,
): ReadonlySet<string> {
  const affectedUris = new Set(semanticReferenceIndex.findReferencingUris(scssPath));
  for (const uri of affectedUris) {
    getDeps(uri)?.analysisCache.invalidate(uri);
  }
  return affectedUris;
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
