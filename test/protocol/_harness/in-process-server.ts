import { PassThrough } from "node:stream";
import {
  createProtocolConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  ExitNotification,
  HoverRequest,
  InitializedNotification,
  InitializeRequest,
  ShutdownRequest,
  type DefinitionParams,
  type DidChangeTextDocumentParams,
  type DidOpenTextDocumentParams,
  type Hover,
  type HoverParams,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type LocationLink,
  type ProtocolConnection,
} from "vscode-languageserver-protocol/node";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import ts from "typescript";
import { createServer, type CreateServerOptions } from "../../../server/src/composition-root.js";

export interface InProcessServerOptions extends Omit<CreateServerOptions, "reader" | "writer"> {}

export interface LspTestClient {
  initialize(overrides?: Partial<InitializeParams>): Promise<InitializeResult>;
  initialized(): void;
  didOpen(params: DidOpenTextDocumentParams): void;
  didChange(params: DidChangeTextDocumentParams): void;
  definition(params: DefinitionParams): Promise<LocationLink[] | Location[] | null>;
  hover(params: HoverParams): Promise<Hover | null>;
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
    ...options,
    reader: new StreamMessageReader(clientToServer),
    writer: new StreamMessageWriter(serverToClient),
  });
  serverConnection.listen();

  const client: ProtocolConnection = createProtocolConnection(
    new StreamMessageReader(serverToClient),
    new StreamMessageWriter(clientToServer),
  );
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
