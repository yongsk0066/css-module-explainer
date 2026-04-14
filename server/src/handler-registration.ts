import type { Connection, TextDocumentPositionParams } from "vscode-languageserver/node";
import type { DidChangeWatchedFilesParams } from "vscode-languageserver/node";
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
  formatCompatPathAliasDeprecationMessage,
  fetchResourceSettingsInfo,
  fetchWindowSettings,
  mergeSettings,
  resourceSettingsDependencyKey,
  shouldWarnCompatPathAlias,
  type WindowSettings,
} from "./settings";
import { createDiagnosticsScheduler, type DiagnosticsScheduler } from "./diagnostics-scheduler";
import type { WorkspaceRegistry } from "./workspace/workspace-registry";
import {
  planSettingsReload,
  planWatchedFileInvalidation,
  type SettingsReloadWorkspaceChange,
} from "./runtime/invalidation-planner";
import {
  createRuntimeDependencySnapshot,
  snapshotOpenDocuments,
} from "./runtime/dependency-snapshot";
import { collectWatchedFileChangeInputs } from "./runtime/watched-file-changes";

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
  readonly warnedCompatPathAliasRoots: Set<string>;
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
    warnedCompatPathAliasRoots: new Set<string>(),
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

        const bundles = registry.allDeps();
        const snapshot = createRuntimeDependencySnapshot(bundles, snapshotOpenDocuments(state.ctx));
        const resourceSettingsByBundle = await Promise.all(
          bundles.map(async (deps) => ({
            deps,
            resourceSettingsInfo: await fetchResourceSettingsInfo(
              connection,
              deps.workspaceFolderUri,
            ),
          })),
        );
        const workspaceChanges: SettingsReloadWorkspaceChange[] = [];
        for (const { deps, resourceSettingsInfo } of resourceSettingsByBundle) {
          const resourceSettings = resourceSettingsInfo.settings;
          const nextSettings = mergeSettings(windowSettings, resourceSettings);
          const prevSettings = deps.settings;
          const prevSettingsKey = resourceSettingsDependencyKey(prevSettings);
          const nextSettingsKey = resourceSettingsDependencyKey(nextSettings);
          deps.settings = nextSettings;

          if (
            shouldWarnCompatPathAlias(
              resourceSettingsInfo,
              state.warnedCompatPathAliasRoots,
              deps.workspaceRoot,
            )
          ) {
            state.warnedCompatPathAliasRoots.add(deps.workspaceRoot);
            connection.console.info(formatCompatPathAliasDeprecationMessage(deps.workspaceRoot));
          }

          const aliasChanged = !shallowEqualPathAlias(
            prevSettings.pathAlias,
            nextSettings.pathAlias,
          );
          const modeChanged =
            prevSettings.scss.classnameTransform !== nextSettings.scss.classnameTransform;
          workspaceChanges.push({
            workspaceRoot: deps.workspaceRoot,
            aliasChanged,
            modeChanged,
            settingsKeyChanged: prevSettingsKey !== nextSettingsKey,
            affectedSettingsDependencyUris: snapshot.findSettingsDependencyUris(
              deps.workspaceRoot,
              prevSettingsKey,
            ),
          });
        }

        const plan = planSettingsReload(workspaceChanges, snapshot.openDocuments);
        for (const deps of bundles) {
          if (!plan.aliasRebuildRoots.includes(deps.workspaceRoot)) continue;
          deps.rebuildAliasResolver(deps.settings.pathAlias);
        }

        if (plan.resourceChanged) {
          for (const uri of plan.affectedSourceUris) {
            const deps = state.ctx.getDeps(uri);
            if (!deps) continue;
            deps.semanticReferenceIndex.forget(uri);
            deps.analysisCache.invalidate(uri);
          }
          bundles[0]?.refreshCodeLens();
          for (const doc of snapshot.openDocuments) {
            if (doc.isStyle) {
              if (
                doc.workspaceRoot !== null &&
                plan.affectedStyleRoots.includes(doc.workspaceRoot)
              ) {
                state.scheduler.scheduleScss(doc.uri);
              }
              continue;
            }
            if (plan.affectedSourceUris.includes(doc.uri)) {
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
  const { connection } = state.ctx;

  connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
    const registry = state.ctx.getRegistry();
    if (!registry) return;
    const snapshot = createRuntimeDependencySnapshot(
      registry.allDeps(),
      snapshotOpenDocuments(state.ctx),
    );
    const changes = collectWatchedFileChangeInputs(
      params.changes,
      {
        documents: state.ctx.documents,
        getDepsForFilePath: (filePath) => registry.getDepsForFilePath(filePath),
      },
      snapshot,
    );
    const plan = planWatchedFileInvalidation(changes, snapshot.openDocuments);
    const affectedDeps = registry
      .allDeps()
      .filter(
        (deps) =>
          plan.aliasRebuildRoots.includes(deps.workspaceRoot) ||
          plan.typeResolverInvalidationRoots.includes(deps.workspaceRoot),
      );
    for (const change of changes) {
      if (change.kind !== "style" || !change.semanticsChanged) continue;
      const deps = registry.getDepsForFilePath(change.filePath);
      if (!deps) continue;
      if (plan.stylePathsToInvalidate.includes(change.filePath)) {
        deps.invalidateStyle(change.filePath);
      }
      if (plan.stylePathsToPush.includes(change.filePath)) {
        deps.pushStyleFile(change.filePath);
      }
    }
    for (const deps of affectedDeps) {
      if (plan.aliasRebuildRoots.includes(deps.workspaceRoot)) {
        deps.rebuildAliasResolver(deps.settings.pathAlias);
      }
      if (plan.typeResolverInvalidationRoots.includes(deps.workspaceRoot)) {
        deps.typeResolver.invalidate(deps.workspaceRoot);
      }
    }
    for (const uri of plan.affectedSourceUris) {
      const deps = state.ctx.getDeps(uri);
      if (!deps) continue;
      deps.semanticReferenceIndex.forget(uri);
      deps.analysisCache.invalidate(uri);
    }
    for (const doc of snapshot.openDocuments) {
      const rootAffected =
        doc.workspaceRoot !== null && plan.affectedWorkspaceRoots.includes(doc.workspaceRoot);
      const sourceAffected = plan.affectedSourceUris.includes(doc.uri);
      if (!rootAffected && !sourceAffected) continue;
      if (doc.isStyle) {
        if (rootAffected) state.scheduler.scheduleScss(doc.uri);
        continue;
      }
      if (sourceAffected) {
        state.scheduler.scheduleTsx(doc.uri);
      }
    }
  });
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
