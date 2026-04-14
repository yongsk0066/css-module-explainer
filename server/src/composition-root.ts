import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { MessageReader, MessageWriter } from "vscode-languageserver/node";
import {
  CodeLensRefreshRequest,
  createConnection,
  DidChangeWatchedFilesNotification,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeParams,
  type InitializeResult,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import ts from "typescript";
import {
  DEFAULT_RESOURCE_SETTINGS,
  DEFAULT_SETTINGS,
  resourceSettingsDependencyKey,
  type ResourceSettings,
} from "./settings";
import { buildStyleFileWatcherGlob, findLangForPath } from "./core/scss/lang-registry";
import { StyleIndexCache } from "./core/scss/scss-index";
import type { StyleDocumentHIR } from "./core/hir/style-types";
import { detectClassUtilImports, scanCxImports } from "./core/cx/binding-detector";
import { parseClassExpressions } from "./core/cx/class-ref-parser";
import { type AliasResolver, AliasResolverHolder } from "./core/cx/alias-resolver";
import { SourceFileCache } from "./core/ts/source-file-cache";
import { WorkspaceTypeResolver, type TypeResolver } from "./core/ts/type-resolver";
import { DocumentAnalysisCache } from "./core/indexing/document-analysis-cache";
import { scssFileSupplier } from "./core/indexing/file-supplier";
import { IndexerWorker } from "./core/indexing/indexer-worker";
import {
  collectSemanticReferenceContribution,
  WorkspaceSemanticWorkspaceReferenceIndex,
} from "./core/semantic/workspace-reference-index";
import { fileUrlToPath, pathToFileUrl } from "./core/util/text-utils";
import { COMPLETION_TRIGGER_CHARACTERS } from "./providers/completion";
import { registerHandlers } from "./handler-registration";
import type { FileTask } from "./core/indexing/indexer-worker";
import {
  WorkspaceRegistry,
  pickOwningWorkspaceFolder,
  type WorkspaceFolderInfo,
  type WorkspaceProviderDeps,
} from "./workspace/workspace-registry";

const SERVER_NAME = "css-module-explainer";
const SERVER_VERSION = "3.1.0";

/**
 * Transport-agnostic shared options consumed by every
 * `createServer` variant. Lives on the "auto" branch of the
 * discriminated union as the implied default — the "streams"
 * branch extends it and adds the required reader/writer pair.
 *
 * Split on `transport` so there is no stringly-typed cast at the
 * `createConnection` call site.
 */
export interface CreateServerAutoOptions {
  /**
   * `"auto"` (default): `createConnection(ProposedFeatures.all)`
   * auto-detects the transport from process.argv flags set by
   * the LanguageClient — `--node-ipc` → IPC, `--stdio` →
   * stdin/stdout.
   */
  readonly transport?: "auto";
  readonly typeResolver?: TypeResolver;
  readonly readStyleFile?: (path: string) => string | null;
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
  readonly readStyleFileAsync?: (path: string) => Promise<string | null>;
  /**
   * Filesystem existence check used by the analysis cache to tag
   * style imports as resolved or missing. Defaults to
   * `fs.existsSync`. Test harnesses inject a stub.
   */
  readonly fileExists?: (path: string) => boolean;
}

/**
 * Streams transport: the caller supplies a preconstructed
 * reader/writer pair (Tier 2 test harness with PassThrough
 * streams). The discriminant narrows both fields to
 * `MessageReader` / `MessageWriter` inside the branch — no cast.
 */
export interface CreateServerStreamsOptions extends Omit<CreateServerAutoOptions, "transport"> {
  readonly transport: "streams";
  readonly reader: MessageReader;
  readonly writer: MessageWriter;
}

export type CreateServerOptions = CreateServerAutoOptions | CreateServerStreamsOptions;

export interface CreatedServer {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
}

/**
 * Build an LSP server instance from a pair of streams plus
 * optional dependency overrides.
 *
 * Does NOT call `connection.listen()` — the caller decides when
 * the event loop starts.
 *
 * Responsibilities are split:
 *   - THIS file: DI assembly (buildBundle) + lifecycle (init/initialized)
 *   - handler-registration.ts: LSP request routing + diagnostics scheduler
 */
export function createServer(options: CreateServerOptions): CreatedServer {
  const connection =
    options.transport === "streams"
      ? createConnection(ProposedFeatures.all, options.reader, options.writer)
      : createConnection(ProposedFeatures.all);
  const documents = new TextDocuments<TextDocument>(TextDocument);

  let registry: WorkspaceRegistry | null = null;
  let caches: BundleCaches | null = null;
  let typeResolver: TypeResolver | null = null;
  let styleDocumentForPath: ((path: string) => StyleDocumentHIR | null) | null = null;
  let fileExists: ((path: string) => boolean) | null = null;
  let watchedFilesDisposable: Promise<{ dispose(): void }> | null = null;
  let clientSupportsDynamicWatchers = false;
  let clientSupportsCodeLensRefresh = false;
  let clientSupportsWorkspaceFolders = false;

  // ── Lifecycle ──────────────────────────────────────────────

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    connection.console.info(`[${SERVER_NAME}] initialize received`);
    const workspaceFolders = resolveWorkspaceFolders(params);
    clientSupportsDynamicWatchers =
      params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration ?? false;
    clientSupportsCodeLensRefresh =
      params.capabilities.workspace?.codeLens?.refreshSupport ?? false;
    clientSupportsWorkspaceFolders = params.capabilities.workspace?.workspaceFolders ?? false;
    caches = buildCaches();
    typeResolver = buildTypeResolver(options);
    registry = new WorkspaceRegistry();
    const readStyleFile = options.readStyleFile ?? defaultReadStyleFile;
    fileExists = options.fileExists ?? existsSync;
    styleDocumentForPath = buildStyleDocumentForPath(
      caches.styleIndexCache,
      documents,
      readStyleFile,
      (stylePath) =>
        registry?.getDepsForFilePath(stylePath)?.settings.scss.classnameTransform ??
        DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform,
    );
    for (const folder of workspaceFolders) {
      const deps = buildBundleForFolder(
        folder,
        workspaceFolders,
        caches,
        typeResolver,
        styleDocumentForPath,
        options,
        connection,
        fileExists,
        clientSupportsCodeLensRefresh,
      );
      registry.register(folder, deps);
    }
    return {
      capabilities: buildCapabilities(),
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    };
  });

  // ── Request routing (delegated to handler-registration.ts) ─

  const handlers = registerHandlers({
    connection,
    documents,
    getDeps: (uri) => registry?.getDeps(uri) ?? null,
    getRegistry: () => registry,
  });

  connection.onInitialized(async () => {
    connection.console.info(`[${SERVER_NAME}] initialized`);
    if (!registry) return;
    if (clientSupportsWorkspaceFolders) {
      connection.workspace.onDidChangeWorkspaceFolders((event) => {
        if (!registry || !caches || !typeResolver || !styleDocumentForPath || !fileExists) return;

        for (const folder of event.removed) {
          const existing = registry.getFolder(folder.uri);
          if (!existing) continue;
          const deps = registry.unregister(folder.uri);
          if (!deps) continue;
          clearWorkspaceFolderDocuments(existing.rootPath, deps, documents, connection);
          deps.stopIndexer();
          deps.typeResolver.invalidate(existing.rootPath);
        }

        for (const folder of event.added) {
          if (registry.getFolder(folder.uri)) continue;
          const folderInfo: WorkspaceFolderInfo = {
            uri: folder.uri,
            rootPath: fileUrlToPath(folder.uri),
            name: folder.name,
          };
          const deps = buildBundleForFolder(
            folderInfo,
            [...registry.getFolders(), folderInfo],
            caches,
            typeResolver,
            styleDocumentForPath,
            options,
            connection,
            fileExists,
            clientSupportsCodeLensRefresh,
          );
          registry.register(folderInfo, deps);
        }

        handlers.refreshSettings();
      });
    }
    if (clientSupportsDynamicWatchers) {
      watchedFilesDisposable = connection.client
        .register(DidChangeWatchedFilesNotification.type, {
          watchers: [
            { globPattern: buildStyleFileWatcherGlob() },
            { globPattern: "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,d.ts}" },
            { globPattern: "**/tsconfig*.json" },
            { globPattern: "**/jsconfig*.json" },
          ],
        })
        .catch(() => ({ dispose: () => {} }));
    }
    handlers.refreshSettings();
  });

  connection.onShutdown(() => {
    handlers.shutdown();
    void watchedFilesDisposable?.then((d) => d.dispose()).catch(() => {});
    watchedFilesDisposable = null;
    registry = null;
  });

  documents.listen(connection);
  return { connection, documents };
}

// ── Helpers ────────────────────────────────────────────────────

function buildCapabilities(): InitializeResult["capabilities"] {
  return {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    definitionProvider: true,
    hoverProvider: true,
    completionProvider: {
      triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS],
      resolveProvider: false,
    },
    codeActionProvider: {
      codeActionKinds: ["quickfix"],
      resolveProvider: false,
    },
    referencesProvider: true,
    codeLensProvider: { resolveProvider: false },
    renameProvider: { prepareProvider: true },
    workspace: {
      workspaceFolders: {
        supported: true,
        changeNotifications: true,
      },
    },
  };
}

function resolveWorkspaceFolders(params: InitializeParams): readonly WorkspaceFolderInfo[] {
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    return params.workspaceFolders.map((folder) => ({
      uri: folder.uri,
      rootPath: fileUrlToPath(folder.uri),
      name: folder.name,
    }));
  }
  const rootPath = params.rootUri
    ? fileUrlToPath(params.rootUri)
    : params.rootPath
      ? params.rootPath
      : process.cwd();
  return [
    {
      uri: pathToFileUrl(rootPath),
      rootPath,
      name: rootPath.split(/[\\/]/u).pop() || rootPath,
    },
  ];
}

function buildBundle(
  folder: WorkspaceFolderInfo,
  workspaceFolders: readonly WorkspaceFolderInfo[],
  caches: BundleCaches,
  typeResolver: TypeResolver,
  styleDocumentForPath: (path: string) => StyleDocumentHIR | null,
  options: CreateServerOptions,
  connection: Connection,
  fileExists: (path: string) => boolean,
  supportsCodeLensRefresh: boolean,
): WorkspaceProviderDeps {
  let currentSettings = DEFAULT_SETTINGS;
  const refreshCodeLens = (): void => {
    if (!supportsCodeLensRefresh) return;
    // Clients advertise support via `workspace.codeLens.refreshSupport`.
    // Unsupported clients may reject the request; swallow that rather
    // than surfacing noisy transport errors.
    void connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
  };
  const aliasHolder = new AliasResolverHolder(folder.rootPath, DEFAULT_SETTINGS.pathAlias);
  const analysisCache = buildAnalysisCache({
    caches,
    styleDocumentForPath,
    workspaceRoot: folder.rootPath,
    typeResolver,
    fileExists,
    getAliasResolver: () => aliasHolder.get(),
    getSettingsKey: () => resourceSettingsDependencyKey(currentSettings),
    refreshCodeLens,
  });
  const indexerWorker = buildIndexerWorker(
    options,
    caches.styleIndexCache,
    folder.rootPath,
    () => currentSettings.scss.classnameTransform,
    (stylePath) => pickOwningWorkspaceFolder(workspaceFolders, stylePath)?.uri === folder.uri,
    connection,
  );

  return {
    analysisCache,
    styleDocumentForPath,
    typeResolver,
    semanticReferenceIndex: caches.semanticReferenceIndex,
    workspaceRoot: folder.rootPath,
    workspaceFolderUri: folder.uri,
    logError: (message, err) => {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      connection.console.error(`[${SERVER_NAME}] ${message}: ${detail}`);
    },
    invalidateStyle: (path) => caches.styleIndexCache.invalidate(path),
    pushStyleFile: (path) => indexerWorker.pushFile({ path }),
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
}

function buildBundleForFolder(
  folder: WorkspaceFolderInfo,
  workspaceFolders: readonly WorkspaceFolderInfo[],
  caches: BundleCaches,
  typeResolver: TypeResolver,
  styleDocumentForPath: (path: string) => StyleDocumentHIR | null,
  options: CreateServerOptions,
  connection: Connection,
  fileExists: (path: string) => boolean,
  supportsCodeLensRefresh: boolean,
): WorkspaceProviderDeps {
  return buildBundle(
    folder,
    workspaceFolders,
    caches,
    typeResolver,
    styleDocumentForPath,
    options,
    connection,
    fileExists,
    supportsCodeLensRefresh,
  );
}

interface BundleCaches {
  readonly sourceFileCache: SourceFileCache;
  readonly styleIndexCache: StyleIndexCache;
  readonly semanticReferenceIndex: WorkspaceSemanticWorkspaceReferenceIndex;
}

function buildCaches(): BundleCaches {
  return {
    sourceFileCache: new SourceFileCache({ max: 200 }),
    styleIndexCache: new StyleIndexCache({ max: 500 }),
    semanticReferenceIndex: new WorkspaceSemanticWorkspaceReferenceIndex(),
  };
}

function buildTypeResolver(options: CreateServerOptions): TypeResolver {
  return (
    options.typeResolver ??
    new WorkspaceTypeResolver({
      createProgram: options.createProgram ?? createDefaultProgram,
    })
  );
}

function buildStyleDocumentForPath(
  styleIndexCache: StyleIndexCache,
  documents: TextDocuments<TextDocument>,
  readStyleFile: (path: string) => string | null,
  getModeForPath: (path: string) => ResourceSettings["scss"]["classnameTransform"],
): (path: string) => StyleDocumentHIR | null {
  return (path: string): StyleDocumentHIR | null => {
    if (!findLangForPath(path)) return null;
    const buffered = readStyleTextFromOpenDocuments(path, documents);
    const mode = getModeForPath(path);
    if (buffered !== null) return styleIndexCache.getStyleDocument(path, buffered, mode);
    const content = readStyleFile(path);
    if (content === null) return null;
    return styleIndexCache.getStyleDocument(path, content, mode);
  };
}

function readStyleTextFromOpenDocuments(
  path: string,
  documents: TextDocuments<TextDocument>,
): string | null {
  const uri = pathToFileUrl(path);
  const doc = documents.get(uri);
  return doc?.getText() ?? null;
}

interface AnalysisCacheArgs {
  readonly caches: BundleCaches;
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly workspaceRoot: string;
  readonly typeResolver: TypeResolver;
  readonly fileExists: (path: string) => boolean;
  readonly getAliasResolver: () => AliasResolver;
  readonly getSettingsKey: () => string;
  readonly refreshCodeLens: () => void;
}

function buildAnalysisCache(args: AnalysisCacheArgs): DocumentAnalysisCache {
  const {
    caches,
    styleDocumentForPath,
    workspaceRoot,
    typeResolver,
    fileExists,
    getAliasResolver,
    getSettingsKey,
    refreshCodeLens,
  } = args;
  return new DocumentAnalysisCache({
    sourceFileCache: caches.sourceFileCache,
    scanCxImports,
    parseClassExpressions,
    detectClassUtilImports,
    fileExists,
    // getter-over-closure: reads currentResolver at analyze() time,
    // so mode changes via rebuildAliasResolver propagate on the next
    // analyze call without cache invalidation.
    get aliasResolver() {
      return getAliasResolver();
    },
    max: 200,
    onAnalyze: (uri, entry) => {
      const semanticContribution = collectSemanticReferenceContribution(uri, entry, {
        styleDocumentForPath,
        typeResolver,
        workspaceRoot,
        filePath: fileUrlToPath(uri),
        settingsKey: getSettingsKey(),
      });
      caches.semanticReferenceIndex.record(
        uri,
        semanticContribution.referenceSites,
        semanticContribution.moduleUsages,
        semanticContribution.deps,
      );
      refreshCodeLens();
    },
  });
}

function buildIndexerWorker(
  options: CreateServerOptions,
  styleIndexCache: StyleIndexCache,
  workspaceRoot: string,
  getMode: () => ResourceSettings["scss"]["classnameTransform"],
  shouldIndexPath: (path: string) => boolean,
  connection: Connection,
): IndexerWorker {
  const indexerLogger = {
    info: (msg: string) => connection.console.info(`[${SERVER_NAME}:indexer] ${msg}`),
    error: (msg: string) => connection.console.error(`[${SERVER_NAME}:indexer] ${msg}`),
  };
  const supplier =
    options.fileSupplier ?? (() => scssFileSupplier(workspaceRoot, indexerLogger, shouldIndexPath));
  const asyncReadFile = options.readStyleFileAsync ?? defaultReadStyleFileAsync;
  const worker = new IndexerWorker({
    supplier,
    readFile: asyncReadFile,
    onScssFile: (path, content) => {
      styleIndexCache.getStyleDocument(path, content, getMode());
    },
    logger: indexerLogger,
  });
  worker.start().catch((err: unknown) => {
    connection.console.error(
      `[${SERVER_NAME}] indexer worker crashed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
  return worker;
}

async function defaultReadStyleFileAsync(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function defaultReadStyleFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function clearWorkspaceFolderDocuments(
  workspaceRoot: string,
  deps: WorkspaceProviderDeps,
  documents: TextDocuments<TextDocument>,
  connection: Connection,
): void {
  for (const doc of documents.all()) {
    const filePath = fileUrlToPath(doc.uri);
    if (!isWithinWorkspaceRoot(workspaceRoot, filePath)) continue;
    deps.semanticReferenceIndex.forget(doc.uri);
    deps.analysisCache.invalidate(doc.uri);
    connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
  }
  deps.refreshCodeLens();
}

function isWithinWorkspaceRoot(workspaceRoot: string, filePath: string): boolean {
  const rel = ts.sys.resolvePath(filePath).replaceAll("\\", "/");
  const root = ts.sys.resolvePath(workspaceRoot).replaceAll("\\", "/");
  return rel === root || rel.startsWith(`${root}/`);
}

/**
 * Minimal production ts.Program builder. Falls back to an empty
 * program when tsconfig is missing or malformed.
 */
export function createDefaultProgram(workspaceRoot: string): ts.Program {
  const EMPTY = ts.createProgram({
    rootNames: [],
    options: { allowJs: true, jsx: ts.JsxEmit.Preserve },
  });

  try {
    const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) return EMPTY;

    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    });
    if (!parsed) return EMPTY;

    return ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      projectReferences: parsed.projectReferences ?? [],
    });
  } catch {
    return EMPTY;
  }
}
