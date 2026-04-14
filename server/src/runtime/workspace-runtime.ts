import nodePath from "node:path";
import type { Connection, TextDocuments } from "vscode-languageserver/node";
import { CodeLensRefreshRequest } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { ResourceSettings } from "../settings";
import { resourceSettingsDependencyKey, DEFAULT_SETTINGS } from "../settings";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import { detectClassUtilImports, scanCxImports } from "../core/cx/binding-detector";
import { parseClassExpressions } from "../core/cx/class-ref-parser";
import { type AliasResolver, AliasResolverHolder } from "../core/cx/alias-resolver";
import { DocumentAnalysisCache } from "../core/indexing/document-analysis-cache";
import { IndexerWorker } from "../core/indexing/indexer-worker";
import { scssFileSupplier } from "../core/indexing/file-supplier";
import type { FileTask } from "../core/indexing/indexer-worker";
import { collectSemanticReferenceContribution } from "../core/semantic/workspace-reference-index";
import type { TypeResolver } from "../core/ts/type-resolver";
import { fileUrlToPath } from "../core/util/text-utils";
import type { WorkspaceFolderInfo, WorkspaceProviderDeps } from "../workspace/workspace-registry";
import type { SharedRuntimeCaches } from "./shared-runtime-caches";

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
  readonly connection: Connection;
  readonly fileExists: (path: string) => boolean;
  readonly supportsCodeLensRefresh: boolean;
  readonly getServerName: () => string;
  readonly getModeForStylePath: (path: string) => ResourceSettings["scss"]["classnameTransform"];
}

export interface WorkspaceRuntime {
  readonly folder: WorkspaceFolderInfo;
  readonly deps: WorkspaceProviderDeps;
  dispose(): void;
  clearWorkspaceDocuments(documents: TextDocuments<TextDocument>): void;
}

export function createWorkspaceRuntime(args: WorkspaceRuntimeFactoryArgs): WorkspaceRuntime {
  let currentSettings = DEFAULT_SETTINGS;
  const refreshCodeLens = (): void => {
    if (!args.supportsCodeLensRefresh) return;
    void args.connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
  };
  const aliasHolder = new AliasResolverHolder(args.folder.rootPath, DEFAULT_SETTINGS.pathAlias);
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache: args.caches.sourceFileCache,
    scanCxImports,
    parseClassExpressions,
    detectClassUtilImports,
    fileExists: args.fileExists,
    get aliasResolver(): AliasResolver {
      return aliasHolder.get();
    },
    max: 200,
    onAnalyze: (uri, entry) => {
      const semanticContribution = collectSemanticReferenceContribution(uri, entry, {
        styleDocumentForPath: args.styleDocumentForPath,
        typeResolver: args.typeResolver,
        workspaceRoot: args.folder.rootPath,
        filePath: fileUrlToPath(uri),
        settingsKey: resourceSettingsDependencyKey(currentSettings),
      });
      args.caches.semanticReferenceIndex.record(
        uri,
        semanticContribution.referenceSites,
        semanticContribution.moduleUsages,
        semanticContribution.deps,
      );
      refreshCodeLens();
    },
  });

  const indexerWorker = buildIndexerWorker(args);

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
      args.connection.console.error(`[${args.getServerName()}] ${message}: ${detail}`);
    },
    invalidateStyle: (stylePath) => {
      args.caches.styleIndexCache.invalidate(stylePath);
      args.caches.styleDependencyGraph.forget(stylePath);
    },
    peekStyleDocument: (stylePath) =>
      args.caches.styleIndexCache.peekEntry(stylePath, currentSettings.scss.classnameTransform)
        ?.styleDocument ?? null,
    buildStyleDocument: (stylePath, content) =>
      args.caches.styleIndexCache.getStyleDocument(
        stylePath,
        content,
        currentSettings.scss.classnameTransform,
      ),
    readStyleFile: args.io.readStyleFile,
    pushStyleFile: (stylePath) => indexerWorker.pushFile({ path: stylePath }),
    indexerReady: indexerWorker.ready,
    stopIndexer: () => indexerWorker.stop(),
    get settings() {
      return currentSettings;
    },
    set settings(next) {
      currentSettings = next;
    },
    rebuildAliasResolver: (pathAlias) => aliasHolder.rebuild(pathAlias),
    refreshCodeLens,
  };

  return {
    folder: args.folder,
    deps,
    dispose() {
      deps.stopIndexer();
      deps.typeResolver.invalidate(args.folder.rootPath);
    },
    clearWorkspaceDocuments(documents) {
      deps.styleDependencyGraph.forgetWithinRoot(args.folder.rootPath);
      for (const doc of documents.all()) {
        const filePath = fileUrlToPath(doc.uri);
        if (!isWithinWorkspaceRoot(args.folder.rootPath, filePath)) continue;
        deps.semanticReferenceIndex.forget(doc.uri);
        deps.analysisCache.invalidate(doc.uri);
        args.connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
      }
      deps.refreshCodeLens();
    },
  };
}

function buildIndexerWorker(args: WorkspaceRuntimeFactoryArgs): IndexerWorker {
  const indexerLogger = {
    info: (msg: string) => args.connection.console.info(`[${args.getServerName()}:indexer] ${msg}`),
    error: (msg: string) =>
      args.connection.console.error(`[${args.getServerName()}:indexer] ${msg}`),
  };
  const supplier =
    args.io.fileSupplier ??
    (() =>
      scssFileSupplier(
        args.folder.rootPath,
        indexerLogger,
        (stylePath) => pickOwningFolder(args.workspaceFolders, stylePath)?.uri === args.folder.uri,
      ));
  const asyncReadFile = args.io.readStyleFileAsync ?? defaultReadStyleFileAsync;
  const worker = new IndexerWorker({
    supplier,
    readFile: asyncReadFile,
    onScssFile: (stylePath, content) => {
      const styleDocument = args.caches.styleIndexCache.getStyleDocument(
        stylePath,
        content,
        args.getModeForStylePath(stylePath),
      );
      args.caches.styleDependencyGraph.record(stylePath, styleDocument);
    },
    logger: indexerLogger,
  });
  worker.start().catch((err: unknown) => {
    args.connection.console.error(
      `[${args.getServerName()}] indexer worker crashed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
  return worker;
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

async function defaultReadStyleFileAsync(stylePath: string): Promise<string | null> {
  const { readFile } = await import("node:fs/promises");
  try {
    return await readFile(stylePath, "utf8");
  } catch {
    return null;
  }
}
