import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { MessageReader, MessageWriter } from "vscode-languageserver/node";
import {
  createConnection,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type DidChangeWatchedFilesParams,
  type InitializeParams,
  type InitializeResult,
  type TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import ts from "typescript";
import type { CxBinding, ScssClassMap } from "@css-module-explainer/shared";
import { buildStyleFileWatcherGlob, findLangForPath } from "./core/scss/lang-registry.js";
import { StyleIndexCache } from "./core/scss/scss-index.js";
import { detectCxBindings } from "./core/cx/binding-detector.js";
import { parseCxCalls } from "./core/cx/call-parser.js";
import { SourceFileCache } from "./core/ts/source-file-cache.js";
import { WorkspaceTypeResolver, type TypeResolver } from "./core/ts/type-resolver.js";
import { DocumentAnalysisCache } from "./core/indexing/document-analysis-cache.js";
import { scssFileSupplier } from "./core/indexing/file-supplier.js";
import { IndexerWorker, type FileTask } from "./core/indexing/indexer-worker.js";
import { collectCallSites, WorkspaceReverseIndex } from "./core/indexing/reverse-index.js";
import { fileUrlToPath } from "./core/util/text-utils.js";
import { handleCodeAction } from "./providers/code-actions.js";
import { COMPLETION_TRIGGER_CHARACTERS, handleCompletion } from "./providers/completion.js";
import { handleDefinition } from "./providers/definition.js";
import { computeDiagnostics } from "./providers/diagnostics.js";
import { handleHover } from "./providers/hover.js";
import type { CursorParams, ProviderDeps } from "./providers/provider-utils.js";
import { handleCodeLens } from "./providers/reference-lens.js";
import { handleReferences } from "./providers/references.js";

const DIAGNOSTICS_DEBOUNCE_MS = 200;

const SERVER_NAME = "css-module-explainer";
const SERVER_VERSION = "0.0.1";

export interface CreateServerOptions {
  /**
   * When both reader and writer are provided, the connection uses
   * them directly (Tier 2 test harness with PassThrough streams).
   * When OMITTED, `createConnection(ProposedFeatures.all)` auto-
   * detects the transport from process.argv flags set by the
   * LanguageClient: `--node-ipc` → IPC, `--stdio` → stdin/stdout.
   *
   * The production entrypoint (server.ts) does NOT pass these so
   * the transport matches whatever `TransportKind` the client
   * extension specifies.
   */
  readonly reader?: MessageReader | NodeJS.ReadableStream;
  readonly writer?: MessageWriter | NodeJS.WritableStream;
  /** Override the workspace TypeResolver (tests pass a Fake). */
  readonly typeResolver?: TypeResolver;
  /** Override disk read for SCSS files (tests pass an in-memory map). */
  readonly readStyleFile?: (path: string) => string | null;
  /** Override ts.Program creation (test injection for the real resolver). */
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  /**
   * Override the background file supplier. Production uses
   * `scssFileSupplier(workspaceRoot)`; tests pass an in-memory
   * iterable so no filesystem walk is triggered.
   */
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
  /** Async disk read used by the indexer worker. */
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
 * the event loop starts. Production wiring calls it immediately;
 * the Tier 2 harness calls it after attaching its client side.
 *
 * `ProviderDeps` is built inside `onInitialize` because
 * `workspaceRoot` comes from the client's initialize params.
 * Tests that only exercise lifecycle never touch the deps bag.
 */
export function createServer(options: CreateServerOptions): CreatedServer {
  // When reader/writer are provided (Tier 2 harness), use them.
  // When omitted (production), auto-detect from process.argv flags
  // set by the LanguageClient (--node-ipc / --stdio / --pipe).
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
  const getDeps = (): ProviderDeps | null => bundle?.deps ?? null;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    connection.console.info(`[${SERVER_NAME}] initialize received`);
    const workspaceRoot = resolveWorkspaceRoot(params);
    clientSupportsDynamicWatchers =
      params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration ?? false;
    bundle = buildBundle(workspaceRoot, options, connection);
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // Hardcoded; feature toggles not yet implemented.
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
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    };
  });

  connection.onInitialized(() => {
    connection.console.info(`[${SERVER_NAME}] initialized`);
    if (!bundle) return;
    // Fire-and-forget: the indexer pre-warms the StyleIndexCache
    // by walking the workspace and reading every style module.
    // The worker yields between files so LSP requests preempt
    // the walk.
    bundle.indexerWorker.start().catch((err: unknown) => {
      connection.console.error(
        `[${SERVER_NAME}] indexer worker crashed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
    // Register dynamic file watcher for .module.{scss,css} change
    // events when the client supports it (checked during
    // initialize). Production VS Code always does; the in-process
    // test harness does not advertise the capability, so the
    // registration is skipped entirely — no spurious rejections.
    // The returned Disposable is retained so `onShutdown` can
    // release it cleanly.
    if (clientSupportsDynamicWatchers) {
      watchedFilesDisposable = connection.client
        .register(DidChangeWatchedFilesNotification.type, {
          watchers: [{ globPattern: buildStyleFileWatcherGlob() }],
        })
        .catch(() => ({ dispose: () => {} }));
    }
  });

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

  // Push-based diagnostics with 200ms debounce.
  const diagTimers = new Map<string, NodeJS.Timeout>();
  const scheduleDiagnostics = (uri: string): void => {
    const existing = diagTimers.get(uri);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      // Fetch state BEFORE deleting the timer handle so a
      // concurrent onDidChangeContent can't see an empty
      // diagTimers entry mid-flight.
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
    // Clear lingering warnings on close.
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
  });

  // File watcher: invalidate StyleIndexCache + re-push the
  // changed file through the indexer so the next provider
  // request sees fresh data. Deletions just drop cache entries.
  connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
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
    // Re-run diagnostics on every open document since style
    // changes can turn warnings on or off.
    for (const doc of documents.all()) {
      scheduleDiagnostics(doc.uri);
    }
  });

  connection.onShutdown(() => {
    bundle?.indexerWorker.stop();
    // Clear any pending debounced diagnostic publishes so they
    // don't fire after shutdown (keeps handles out of the event
    // loop and drops closures referencing documents/connection).
    for (const timer of diagTimers.values()) clearTimeout(timer);
    diagTimers.clear();
    // Unregister dynamic file watcher if the client accepted it.
    void watchedFilesDisposable?.then((d) => d.dispose()).catch(() => {});
    watchedFilesDisposable = null;
    bundle = null;
  });

  documents.listen(connection);
  return { connection, documents };
}

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
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings,
    parseCxCalls,
    max: 200,
    // Index cx() call sites exactly once per (uri, version) —
    // keeps the reverse-index write off the provider hot path.
    onAnalyze: (uri, entry) => {
      reverseIndex.record(uri, collectCallSites(uri, entry));
    },
  });

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
  const scssClassMapFor = (binding: CxBinding) => classMapForPath(binding.scssModulePath);

  const indexerLogger = {
    info: (msg: string) => connection.console.info(`[${SERVER_NAME}:indexer] ${msg}`),
    error: (msg: string) => connection.console.error(`[${SERVER_NAME}:indexer] ${msg}`),
  };

  const deps: ProviderDeps = {
    analysisCache,
    scssClassMapFor,
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
      // Pre-warm the style index so the next provider request on
      // this file's classMap hits in-memory instead of parsing.
      styleIndexCache.get(path, content);
    },
    onTsxFile: () => {
      // Intentional no-op: SCSS is the only indexed file kind today.
    },
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
 * Minimal production ts.Program builder. Parses tsconfig.json
 * relative to the workspace root, falls back to an empty program
 * when missing or malformed. The entire body is wrapped in
 * try/catch so a corrupt tsconfig never crashes the initialize
 * handshake.
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
