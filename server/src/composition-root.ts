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
import { DEFAULT_SETTINGS } from "./settings";
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
import type { ProviderDeps } from "./providers/provider-deps";
import { registerHandlers } from "./handler-registration";
import type { FileTask } from "./core/indexing/indexer-worker";

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

  let bundle: ProviderDeps | null = null;
  let watchedFilesDisposable: Promise<{ dispose(): void }> | null = null;
  let clientSupportsDynamicWatchers = false;
  let clientSupportsCodeLensRefresh = false;

  // ── Lifecycle ──────────────────────────────────────────────

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    connection.console.info(`[${SERVER_NAME}] initialize received`);
    const workspaceRoot = resolveWorkspaceRoot(params);
    clientSupportsDynamicWatchers =
      params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration ?? false;
    clientSupportsCodeLensRefresh =
      params.capabilities.workspace?.codeLens?.refreshSupport ?? false;
    bundle = buildBundle(
      workspaceRoot,
      options,
      connection,
      documents,
      clientSupportsCodeLensRefresh,
    );
    return {
      capabilities: buildCapabilities(),
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    };
  });

  // ── Request routing (delegated to handler-registration.ts) ─

  const handlers = registerHandlers({
    connection,
    documents,
    getDeps: () => bundle,
  });

  connection.onInitialized(async () => {
    connection.console.info(`[${SERVER_NAME}] initialized`);
    if (!bundle) return;
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
    bundle = null;
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
  };
}

function resolveWorkspaceRoot(params: InitializeParams): string {
  const folder = params.workspaceFolders?.[0];
  if (folder) return fileUrlToPath(folder.uri);
  if (params.rootUri) return fileUrlToPath(params.rootUri);
  if (params.rootPath) return params.rootPath;
  return process.cwd();
}

function buildBundle(
  workspaceRoot: string,
  options: CreateServerOptions,
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  supportsCodeLensRefresh: boolean,
): ProviderDeps {
  const refreshCodeLens = (): void => {
    if (!supportsCodeLensRefresh) return;
    // Clients advertise support via `workspace.codeLens.refreshSupport`.
    // Unsupported clients may reject the request; swallow that rather
    // than surfacing noisy transport errors.
    void connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
  };
  const caches = buildCaches();
  const typeResolver = buildTypeResolver(options);
  const readStyleFile = options.readStyleFile ?? defaultReadStyleFile;
  const fileExists = options.fileExists ?? existsSync;
  const styleDocumentForPath = buildStyleDocumentForPath(
    caches.styleIndexCache,
    documents,
    readStyleFile,
  );
  const aliasHolder = new AliasResolverHolder(workspaceRoot, DEFAULT_SETTINGS.pathAlias);
  const analysisCache = buildAnalysisCache({
    caches,
    styleDocumentForPath,
    workspaceRoot,
    typeResolver,
    fileExists,
    getAliasResolver: () => aliasHolder.get(),
    refreshCodeLens,
  });
  const indexerWorker = buildIndexerWorker(
    options,
    caches.styleIndexCache,
    workspaceRoot,
    connection,
  );

  return {
    analysisCache,
    styleDocumentForPath,
    typeResolver,
    semanticReferenceIndex: caches.semanticReferenceIndex,
    workspaceRoot,
    logError: (message, err) => {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      connection.console.error(`[${SERVER_NAME}] ${message}: ${detail}`);
    },
    invalidateStyle: (path) => caches.styleIndexCache.invalidate(path),
    pushStyleFile: (path) => indexerWorker.pushFile({ path }),
    indexerReady: indexerWorker.ready,
    stopIndexer: () => indexerWorker.stop(),
    settings: DEFAULT_SETTINGS,
    rebuildAliasResolver: (pathAlias) => aliasHolder.rebuild(pathAlias),
    setClassnameTransform(mode) {
      caches.styleIndexCache.setMode(mode);
      caches.semanticReferenceIndex.clear();
    },
    refreshCodeLens,
  };
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
): (path: string) => StyleDocumentHIR | null {
  return (path: string): StyleDocumentHIR | null => {
    if (!findLangForPath(path)) return null;
    const buffered = readStyleTextFromOpenDocuments(path, documents);
    if (buffered !== null) return styleIndexCache.getStyleDocument(path, buffered);
    const content = readStyleFile(path);
    if (content === null) return null;
    return styleIndexCache.getStyleDocument(path, content);
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
      });
      caches.semanticReferenceIndex.record(
        uri,
        semanticContribution.referenceSites,
        semanticContribution.moduleUsages,
      );
      refreshCodeLens();
    },
  });
}

function buildIndexerWorker(
  options: CreateServerOptions,
  styleIndexCache: StyleIndexCache,
  workspaceRoot: string,
  connection: Connection,
): IndexerWorker {
  const indexerLogger = {
    info: (msg: string) => connection.console.info(`[${SERVER_NAME}:indexer] ${msg}`),
    error: (msg: string) => connection.console.error(`[${SERVER_NAME}:indexer] ${msg}`),
  };
  const supplier = options.fileSupplier ?? (() => scssFileSupplier(workspaceRoot, indexerLogger));
  const asyncReadFile = options.readStyleFileAsync ?? defaultReadStyleFileAsync;
  const worker = new IndexerWorker({
    supplier,
    readFile: asyncReadFile,
    onScssFile: (path, content) => {
      styleIndexCache.getStyleDocument(path, content);
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
