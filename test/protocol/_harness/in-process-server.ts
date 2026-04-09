import { PassThrough } from "node:stream";
import {
  CompletionRequest,
  createProtocolConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidChangeWatchedFilesNotification,
  DidOpenTextDocumentNotification,
  ExitNotification,
  HoverRequest,
  InitializedNotification,
  InitializeRequest,
  PublishDiagnosticsNotification,
  ShutdownRequest,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type DefinitionParams,
  type Diagnostic,
  type DidChangeTextDocumentParams,
  type DidChangeWatchedFilesParams,
  type DidOpenTextDocumentParams,
  type Hover,
  type HoverParams,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type LocationLink,
  type ProtocolConnection,
  type PublishDiagnosticsParams,
} from "vscode-languageserver-protocol/node";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import ts from "typescript";
import { createServer, type CreateServerOptions } from "../../../server/src/composition-root.js";
import type { FileTask } from "../../../server/src/core/indexing/indexer-worker.js";

// eslint-disable-next-line @typescript-eslint/require-await
async function* emptySupplier(): AsyncGenerator<FileTask> {
  // yields nothing
}

export interface InProcessServerOptions extends Omit<CreateServerOptions, "reader" | "writer"> {}

export interface LspTestClient {
  initialize(overrides?: Partial<InitializeParams>): Promise<InitializeResult>;
  initialized(): void;
  didOpen(params: DidOpenTextDocumentParams): void;
  didChange(params: DidChangeTextDocumentParams): void;
  definition(params: DefinitionParams): Promise<LocationLink[] | Location[] | null>;
  hover(params: HoverParams): Promise<Hover | null>;
  completion(params: CompletionParams): Promise<CompletionItem[] | CompletionList | null>;
  /**
   * Wait for the next publishDiagnostics notification matching
   * `uri`, or reject after `timeoutMs`. Use this to test the
   * debounced push-based diagnostics pipeline (Plan 09).
   */
  waitForDiagnostics(uri: string, timeoutMs?: number): Promise<Diagnostic[]>;
  didChangeWatchedFiles(params: DidChangeWatchedFilesParams): void;
  shutdown(): Promise<void>;
  exit(): void;
  dispose(): void;
}

/**
 * Build an in-process LSP server wired to an in-process client.
 *
 * Two PassThrough streams form a full-duplex pair:
 *   serverOut ──► clientIn  (server → client)
 *   clientOut ──► serverIn  (client → server)
 *
 * The server is started immediately. The returned client exposes
 * typed request helpers for the handful of LSP methods Plans 06–09
 * exercise; additional helpers can be added as plans land.
 *
 * `dispose()` ends both streams and disposes both connections.
 * Tests MUST call it in afterEach to avoid resource leaks.
 */
export function createInProcessServer(options: InProcessServerOptions = {}): LspTestClient {
  const serverToClient = new PassThrough();
  const clientToServer = new PassThrough();

  // Pre-wrap streams in typed reader/writer BEFORE handing them to
  // createServer. vscode-languageserver/node otherwise detects a raw
  // readable stream and attaches its own `end`/`close` handlers that
  // call `process.exit()` — fine in production (the server should
  // die when the client disconnects) but catastrophic for in-process
  // tests: exiting kills the vitest worker. Wrapping hides the raw
  // `.read` method and skips the auto-exit block.
  //
  // Default `createProgram` to an empty ts.Program. Without this,
  // composition-root's createDefaultProgram calls
  // `ts.findConfigFile("/fake/workspace", ...)` which walks upward
  // from /fake/workspace (nonexistent) and can find the REAL repo
  // tsconfig.json at /Users/.../css-module-explainer/tsconfig.json —
  // a test-hermeticity leak. The spread lets individual tests
  // override.
  const { connection: serverConnection } = createServer({
    createProgram: () =>
      ts.createProgram({
        rootNames: [],
        options: { allowJs: true, jsx: ts.JsxEmit.Preserve },
      }),
    // Default indexer supplier → empty. Tests exercise providers
    // via didOpen + in-memory readStyleFile; the background walk
    // is not wanted because it would hit the real filesystem.
    fileSupplier: () => emptySupplier(),
    readStyleFileAsync: async () => null,
    ...options,
    reader: new StreamMessageReader(clientToServer),
    writer: new StreamMessageWriter(serverToClient),
  });
  serverConnection.listen();

  const client: ProtocolConnection = createProtocolConnection(
    new StreamMessageReader(serverToClient),
    new StreamMessageWriter(clientToServer),
  );
  const pendingDiagnostics = new Map<string, PublishDiagnosticsParams[]>();
  const diagnosticsWaiters = new Map<
    string,
    Array<{ resolve: (d: Diagnostic[]) => void; reject: (e: unknown) => void }>
  >();
  client.onNotification(PublishDiagnosticsNotification.type, (params) => {
    const waiters = diagnosticsWaiters.get(params.uri);
    if (waiters && waiters.length > 0) {
      const waiter = waiters.shift()!;
      waiter.resolve([...params.diagnostics]);
      return;
    }
    const queue = pendingDiagnostics.get(params.uri) ?? [];
    queue.push(params);
    pendingDiagnostics.set(params.uri, queue);
  });
  client.listen();

  return {
    async initialize(overrides) {
      const base: InitializeParams = {
        processId: process.pid,
        rootUri: "file:///fake/workspace",
        capabilities: {},
        workspaceFolders: [{ uri: "file:///fake/workspace", name: "fake" }],
      };
      return client.sendRequest(InitializeRequest.type, { ...base, ...overrides });
    },
    initialized() {
      client.sendNotification(InitializedNotification.type, {});
    },
    didOpen(params) {
      client.sendNotification(DidOpenTextDocumentNotification.type, params);
    },
    didChange(params) {
      client.sendNotification(DidChangeTextDocumentNotification.type, params);
    },
    async definition(params) {
      return client.sendRequest(DefinitionRequest.type, params);
    },
    async hover(params) {
      return client.sendRequest(HoverRequest.type, params);
    },
    async completion(params) {
      return client.sendRequest(CompletionRequest.type, params);
    },
    didChangeWatchedFiles(params) {
      client.sendNotification(DidChangeWatchedFilesNotification.type, params);
    },
    async waitForDiagnostics(uri, timeoutMs = 1500) {
      const queue = pendingDiagnostics.get(uri);
      if (queue && queue.length > 0) {
        return [...queue.shift()!.diagnostics];
      }
      return new Promise<Diagnostic[]>((resolve, reject) => {
        const list = diagnosticsWaiters.get(uri) ?? [];
        const timer = setTimeout(() => {
          const filtered = list.filter((w) => w.resolve !== resolve);
          diagnosticsWaiters.set(uri, filtered);
          reject(new Error(`waitForDiagnostics(${uri}) timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        list.push({
          resolve: (d) => {
            clearTimeout(timer);
            resolve(d);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        diagnosticsWaiters.set(uri, list);
      });
    },
    async shutdown() {
      await client.sendRequest(ShutdownRequest.type, undefined);
    },
    exit() {
      client.sendNotification(ExitNotification.type);
    },
    dispose() {
      // TODO(plan-10.5): revisit if Tier 3 E2E surfaces stream
      // leaks. For now we deliberately do NOT destroy the
      // PassThrough pair to avoid ERR_STREAM_WRITE_AFTER_END on
      // racing shutdown acks. Each test owns a fresh pair, so GC
      // reclaims them at vitest worker shutdown.
      client.dispose();
      serverConnection.dispose();
    },
  };
}
