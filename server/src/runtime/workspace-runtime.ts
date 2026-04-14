import nodePath from "node:path";
import type { ResourceSettings } from "../settings";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import type { FileTask } from "../core/indexing/indexer-worker";
import type { TypeResolver } from "../core/ts/type-resolver";
import { fileUrlToPath } from "../core/util/text-utils";
import type { WorkspaceFolderInfo, WorkspaceProviderDeps } from "../workspace/workspace-registry";
import type { SharedRuntimeCaches } from "./shared-runtime-caches";
import type { RuntimeSink } from "./runtime-sink";
import { createWorkspaceAnalysisCache } from "./workspace-analysis-runtime";
import {
  createWorkspaceRuntimeSettingsState,
  type WorkspaceRuntimeSettingsState,
} from "./workspace-runtime-settings";
import { createWorkspaceStyleRuntime } from "./workspace-style-runtime";

export interface WorkspaceRuntimeIO {
  readonly readStyleFile: (path: string) => string | null;
  readonly readStyleFileAsync?: (path: string) => Promise<string | null>;
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
}

export interface WorkspaceRuntimeFactoryArgs {
  readonly folder: WorkspaceFolderInfo;
  readonly workspaceFolders: readonly WorkspaceFolderInfo[];
  readonly caches: SharedRuntimeCaches;
  readonly typeResolver: TypeResolver;
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly io: WorkspaceRuntimeIO;
  readonly sink: RuntimeSink;
  readonly fileExists: (path: string) => boolean;
  readonly serverName: string;
  readonly getModeForStylePath: (path: string) => ResourceSettings["scss"]["classnameTransform"];
}

export interface WorkspaceRuntime {
  readonly folder: WorkspaceFolderInfo;
  readonly deps: WorkspaceProviderDeps;
  dispose(): void;
  clearWorkspaceDocuments(documents: RuntimeDocumentsLike): void;
}

export interface RuntimeDocumentsLike {
  all(): readonly { readonly uri: string }[];
}

export function createWorkspaceRuntime(args: WorkspaceRuntimeFactoryArgs): WorkspaceRuntime {
  const settingsState = createWorkspaceRuntimeSettingsState(args.folder.rootPath);
  const styleRuntime = createWorkspaceStyleRuntime({
    workspaceRoot: args.folder.rootPath,
    caches: args.caches,
    io: args.io,
    sink: args.sink,
    serverName: args.serverName,
    getModeForStylePath: args.getModeForStylePath,
    isOwnedStylePath: (stylePath) =>
      pickOwningFolder(args.workspaceFolders, stylePath)?.uri === args.folder.uri,
  });
  const analysisCache = createWorkspaceAnalysisCache({
    caches: args.caches,
    typeResolver: args.typeResolver,
    workspaceRoot: args.folder.rootPath,
    styleDocumentForPath: args.styleDocumentForPath,
    fileExists: args.fileExists,
    aliasResolver: () => settingsState.aliasResolver,
    settingsKey: () => settingsState.settingsKey,
    onReferencesChanged: () => args.sink.requestCodeLensRefresh(),
  });

  const deps: WorkspaceProviderDeps = {
    analysisCache,
    styleDocumentForPath: args.styleDocumentForPath,
    typeResolver: args.typeResolver,
    semanticReferenceIndex: args.caches.semanticReferenceIndex,
    styleDependencyGraph: args.caches.styleDependencyGraph,
    workspaceRoot: args.folder.rootPath,
    workspaceFolderUri: args.folder.uri,
    logError: (message, err) => {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      args.sink.error(`[${args.serverName}] ${message}: ${detail}`);
    },
    invalidateStyle: (stylePath) => styleRuntime.invalidateStyle(stylePath),
    peekStyleDocument: (stylePath) =>
      styleRuntime.peekStyleDocument(stylePath, settingsState.classnameTransform),
    buildStyleDocument: (stylePath, content) =>
      styleRuntime.buildStyleDocument(stylePath, content, settingsState.classnameTransform),
    readStyleFile: args.io.readStyleFile,
    pushStyleFile: (stylePath) => styleRuntime.pushStyleFile(stylePath),
    indexerReady: styleRuntime.indexerReady,
    stopIndexer: () => styleRuntime.stop(),
    get settings() {
      return settingsState.get();
    },
    set settings(next) {
      settingsState.set(next);
    },
    rebuildAliasResolver: (pathAlias) => settingsState.rebuildAliasResolver(pathAlias),
    refreshCodeLens: () => args.sink.requestCodeLensRefresh(),
  };

  return {
    folder: args.folder,
    deps,
    dispose() {
      deps.stopIndexer();
      deps.typeResolver.invalidate(args.folder.rootPath);
    },
    clearWorkspaceDocuments(documents) {
      clearWorkspaceDocuments(args.folder.rootPath, documents, deps, args.sink);
    },
  };
}

function clearWorkspaceDocuments(
  workspaceRoot: string,
  documents: RuntimeDocumentsLike,
  deps: WorkspaceProviderDeps,
  sink: RuntimeSink,
): void {
  deps.styleDependencyGraph.forgetWithinRoot(workspaceRoot);
  for (const doc of documents.all()) {
    const filePath = fileUrlToPath(doc.uri);
    if (!isWithinWorkspaceRoot(workspaceRoot, filePath)) continue;
    deps.semanticReferenceIndex.forget(doc.uri);
    deps.analysisCache.invalidate(doc.uri);
    sink.clearDiagnostics(doc.uri);
  }
  deps.refreshCodeLens();
}

function pickOwningFolder(
  folders: readonly WorkspaceFolderInfo[],
  filePath: string,
): WorkspaceFolderInfo | null {
  let winner: WorkspaceFolderInfo | null = null;
  for (const folder of folders) {
    if (!isWithinWorkspaceRoot(folder.rootPath, filePath)) continue;
    if (!winner || folder.rootPath.length > winner.rootPath.length) {
      winner = folder;
    }
  }
  return winner;
}

function isWithinWorkspaceRoot(workspaceRoot: string, filePath: string): boolean {
  const rel = nodePath.relative(workspaceRoot, filePath);
  return rel === "" || (!rel.startsWith("..") && !nodePath.isAbsolute(rel));
}

export type { WorkspaceRuntimeSettingsState };
