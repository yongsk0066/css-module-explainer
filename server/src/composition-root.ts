import { existsSync } from "node:fs";
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
import type ts from "typescript";
import { DEFAULT_RESOURCE_SETTINGS } from "./settings";
import { buildStyleFileWatcherGlob } from "./core/scss/lang-registry";
import type { StyleDocumentHIR } from "./core/hir/style-types";
import type { TypeResolver } from "./core/ts/type-resolver";
import { fileUrlToPath, pathToFileUrl } from "./core/util/text-utils";
import type { FileTask } from "./core/indexing/indexer-worker";
import { COMPLETION_TRIGGER_CHARACTERS } from "./providers/completion";
import { registerHandlers } from "./handler-registration";
import { WorkspaceRegistry, type WorkspaceFolderInfo } from "./workspace/workspace-registry";
import {
  buildSharedRuntimeCaches,
  createRuntimeTypeResolver,
  createStyleDocumentLookup,
  createWorkspaceRuntimeIO,
  defaultReadStyleFile,
  registerWorkspaceRuntime,
  type RuntimeSink,
  type SharedRuntimeCaches,
  unregisterWorkspaceRuntime,
  type WorkspaceRuntime,
} from "./runtime";

const SERVER_NAME = "css-module-explainer";
const SERVER_VERSION = "3.2.0";

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

export { createDefaultProgram } from "./core/ts/default-program";

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
  const readStyleFile = options.readStyleFile ?? defaultReadStyleFile;

  let registry: WorkspaceRegistry | null = null;
  let runtimes: Map<string, WorkspaceRuntime> | null = null;
  let caches: SharedRuntimeCaches | null = null;
  let typeResolver: TypeResolver | null = null;
  let styleDocumentForPath: ((path: string) => StyleDocumentHIR | null) | null = null;
  let runtimeIO: ReturnType<typeof createWorkspaceRuntimeIO> | null = null;
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
    caches = buildSharedRuntimeCaches();
    typeResolver = createRuntimeTypeResolver({
      ...(options.typeResolver ? { typeResolver: options.typeResolver } : {}),
      ...(options.createProgram ? { createProgram: options.createProgram } : {}),
    });
    registry = new WorkspaceRegistry();
    runtimes = new Map();
    fileExists = options.fileExists ?? existsSync;
    styleDocumentForPath = createStyleDocumentLookup({
      styleIndexCache: caches.styleIndexCache,
      styleDependencyGraph: caches.styleDependencyGraph,
      readOpenDocumentText: (stylePath) => readStyleTextFromOpenDocuments(stylePath, documents),
      readStyleFile,
      getModeForPath: (stylePath) =>
        registry?.getDepsForFilePath(stylePath)?.settings.scss.classnameTransform ??
        DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform,
    });
    runtimeIO = createWorkspaceRuntimeIO({
      readStyleFile,
      ...(options.readStyleFileAsync ? { readStyleFileAsync: options.readStyleFileAsync } : {}),
      ...(options.fileSupplier ? { fileSupplier: options.fileSupplier } : {}),
    });
    for (const folder of workspaceFolders) {
      registerWorkspaceRuntime({
        registry,
        runtimes,
        folder,
        workspaceFolders,
        caches,
        typeResolver,
        styleDocumentForPath,
        io: runtimeIO,
        sink: buildRuntimeSink(connection, clientSupportsCodeLensRefresh),
        fileExists,
        serverName: SERVER_NAME,
        getModeForStylePath: (stylePath) =>
          registry?.getDepsForFilePath(stylePath)?.settings.scss.classnameTransform ??
          DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform,
      });
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
        if (
          !registry ||
          !runtimes ||
          !caches ||
          !typeResolver ||
          !styleDocumentForPath ||
          !runtimeIO ||
          !fileExists
        ) {
          return;
        }

        for (const folder of event.removed) {
          unregisterWorkspaceRuntime({
            registry,
            runtimes,
            folderUri: folder.uri,
            documents,
          });
        }

        for (const folder of event.added) {
          if (registry.getFolder(folder.uri)) continue;
          const folderInfo: WorkspaceFolderInfo = {
            uri: folder.uri,
            rootPath: fileUrlToPath(folder.uri),
            name: folder.name,
          };
          registerWorkspaceRuntime({
            registry,
            runtimes,
            folder: folderInfo,
            workspaceFolders: [...registry.getFolders(), folderInfo],
            caches,
            typeResolver,
            styleDocumentForPath,
            io: runtimeIO,
            sink: buildRuntimeSink(connection, clientSupportsCodeLensRefresh),
            fileExists,
            serverName: SERVER_NAME,
            getModeForStylePath: (stylePath) =>
              registry?.getDepsForFilePath(stylePath)?.settings.scss.classnameTransform ??
              DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform,
          });
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
    runtimes = null;
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

function readStyleTextFromOpenDocuments(
  path: string,
  documents: TextDocuments<TextDocument>,
): string | null {
  const uri = pathToFileUrl(path);
  const doc = documents.get(uri);
  return doc?.getText() ?? null;
}

function buildRuntimeSink(connection: Connection, supportsCodeLensRefresh: boolean): RuntimeSink {
  return {
    info(message: string): void {
      connection.console.info(message);
    },
    error(message: string): void {
      connection.console.error(message);
    },
    clearDiagnostics(uri: string): void {
      connection.sendDiagnostics({ uri, diagnostics: [] });
    },
    requestCodeLensRefresh(): void {
      if (!supportsCodeLensRefresh) return;
      void connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
    },
  };
}
