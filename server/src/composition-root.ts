import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { MessageReader, MessageWriter } from "vscode-languageserver/node";
import {
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
import type { ScssClassMap } from "@css-module-explainer/shared";
import { buildStyleFileWatcherGlob, findLangForPath } from "./core/scss/lang-registry";
import { StyleIndexCache } from "./core/scss/scss-index";
import { collectStyleImports, detectCxBindings } from "./core/cx/binding-detector";
import { parseCxCalls } from "./core/cx/call-parser";
import { parseStylePropertyAccesses } from "./core/cx/style-access-parser";
import { SourceFileCache } from "./core/ts/source-file-cache";
import { WorkspaceTypeResolver, type TypeResolver } from "./core/ts/type-resolver";
import { DocumentAnalysisCache } from "./core/indexing/document-analysis-cache";
import { scssFileSupplier } from "./core/indexing/file-supplier";
import { IndexerWorker } from "./core/indexing/indexer-worker";
import { collectCallSites, WorkspaceReverseIndex } from "./core/indexing/reverse-index";
import { fileUrlToPath } from "./core/util/text-utils";
import { COMPLETION_TRIGGER_CHARACTERS } from "./providers/completion";
import type { ProviderDeps } from "./providers/cursor-dispatch";
import { registerHandlers } from "./handler-registration";
import type { FileTask } from "./core/indexing/indexer-worker";

const SERVER_NAME = "css-module-explainer";
const SERVER_VERSION = "1.3.0";

export interface CreateServerOptions {
  /**
   * When both reader and writer are provided, the connection uses
   * them directly (Tier 2 test harness with PassThrough streams).
   * When OMITTED, `createConnection(ProposedFeatures.all)` auto-
   * detects the transport from process.argv flags set by the
   * LanguageClient: `--node-ipc` → IPC, `--stdio` → stdin/stdout.
   */
  readonly reader?: MessageReader | NodeJS.ReadableStream;
  readonly writer?: MessageWriter | NodeJS.WritableStream;
  readonly typeResolver?: TypeResolver;
  readonly readStyleFile?: (path: string) => string | null;
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
  readonly readStyleFileAsync?: (path: string) => Promise<string | null>;
}

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
    options.reader && options.writer
      ? createConnection(
          ProposedFeatures.all,
          options.reader as MessageReader,
          options.writer as MessageWriter,
        )
      : createConnection(ProposedFeatures.all);
  const documents = new TextDocuments<TextDocument>(TextDocument);

  let bundle: CompositionBundle | null = null;
  let watchedFilesDisposable: Promise<{ dispose(): void }> | null = null;
  let clientSupportsDynamicWatchers = false;

  // ── Lifecycle ──────────────────────────────────────────────

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    connection.console.info(`[${SERVER_NAME}] initialize received`);
    const workspaceRoot = resolveWorkspaceRoot(params);
    clientSupportsDynamicWatchers =
      params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration ?? false;
    bundle = buildBundle(workspaceRoot, options, connection);
    return {
      capabilities: {
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
      },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    };
  });

  // ── Request routing (delegated to handler-registration.ts) ─

  const handlers = registerHandlers({
    connection,
    documents,
    getDeps: () => bundle?.deps ?? null,
    getBundle: () =>
      bundle
        ? { styleIndexCache: bundle.styleIndexCache, indexerWorker: bundle.indexerWorker }
        : null,
  });

  connection.onInitialized(async () => {
    connection.console.info(`[${SERVER_NAME}] initialized`);
    if (!bundle) return;
    bundle.indexerWorker.start().catch((err: unknown) => {
      connection.console.error(
        `[${SERVER_NAME}] indexer worker crashed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
    if (clientSupportsDynamicWatchers) {
      watchedFilesDisposable = connection.client
        .register(DidChangeWatchedFilesNotification.type, {
          watchers: [{ globPattern: buildStyleFileWatcherGlob() }],
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

function resolveWorkspaceRoot(params: InitializeParams): string {
  const folder = params.workspaceFolders?.[0];
  if (folder) return fileUrlToPath(folder.uri);
  if (params.rootUri) return fileUrlToPath(params.rootUri);
  if (params.rootPath) return params.rootPath;
  return process.cwd();
}

interface CompositionBundle {
  readonly deps: ProviderDeps;
  readonly styleIndexCache: StyleIndexCache;
  readonly indexerWorker: IndexerWorker;
}

function buildBundle(
  workspaceRoot: string,
  options: CreateServerOptions,
  connection: Connection,
): CompositionBundle {
  const sourceFileCache = new SourceFileCache({ max: 200 });
  const styleIndexCache = new StyleIndexCache({ max: 500 });
  const reverseIndex = new WorkspaceReverseIndex();

  const typeResolver: TypeResolver =
    options.typeResolver ??
    new WorkspaceTypeResolver({
      createProgram: options.createProgram ?? createDefaultProgram,
    });

  const readStyleFile = options.readStyleFile ?? defaultReadStyleFile;
  const classMapForPath = (path: string): ScssClassMap | null => {
    if (!findLangForPath(path)) return null;
    const content = readStyleFile(path);
    if (content === null) return null;
    return styleIndexCache.get(path, content);
  };

  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports,
    detectCxBindings,
    parseCxCalls,
    parseStyleAccesses: parseStylePropertyAccesses,
    max: 200,
    onAnalyze: (uri, entry) => {
      reverseIndex.record(
        uri,
        collectCallSites(uri, entry, {
          classMapForPath,
          typeResolver,
          workspaceRoot,
          filePath: fileUrlToPath(uri),
        }),
      );
    },
  });

  const indexerLogger = {
    info: (msg: string) => connection.console.info(`[${SERVER_NAME}:indexer] ${msg}`),
    error: (msg: string) => connection.console.error(`[${SERVER_NAME}:indexer] ${msg}`),
  };

  const deps: ProviderDeps = {
    analysisCache,
    scssClassMapForPath: classMapForPath,
    typeResolver,
    reverseIndex,
    workspaceRoot,
    logError: (message, err) => {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      connection.console.error(`[${SERVER_NAME}] ${message}: ${detail}`);
    },
  };

  const supplier = options.fileSupplier ?? (() => scssFileSupplier(workspaceRoot, indexerLogger));
  const asyncReadFile = options.readStyleFileAsync ?? defaultReadStyleFileAsync;
  const indexerWorker = new IndexerWorker({
    supplier,
    readFile: asyncReadFile,
    onScssFile: (path, content) => {
      styleIndexCache.get(path, content);
    },
    onTsxFile: () => {},
    logger: indexerLogger,
  });

  return { deps, styleIndexCache, indexerWorker };
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
