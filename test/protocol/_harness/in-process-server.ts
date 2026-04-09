import { PassThrough } from "node:stream";
import {
  createProtocolConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  ExitNotification,
  InitializedNotification,
  InitializeRequest,
  ShutdownRequest,
  type DefinitionParams,
  type DidChangeTextDocumentParams,
  type DidOpenTextDocumentParams,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type LocationLink,
  type ProtocolConnection,
} from "vscode-languageserver-protocol/node";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import { createServer, type CreateServerOptions } from "../../../server/src/composition-root.js";

export interface InProcessServerOptions extends Omit<CreateServerOptions, "reader" | "writer"> {}

export interface LspTestClient {
  initialize(overrides?: Partial<InitializeParams>): Promise<InitializeResult>;
  initialized(): void;
  didOpen(params: DidOpenTextDocumentParams): void;
  didChange(params: DidChangeTextDocumentParams): void;
  definition(params: DefinitionParams): Promise<LocationLink[] | Location[] | null>;
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

  const { connection: serverConnection } = createServer({
    reader: clientToServer,
    writer: serverToClient,
    ...options,
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
    async shutdown() {
      await client.sendRequest(ShutdownRequest.type, undefined);
    },
    exit() {
      client.sendNotification(ExitNotification.type);
    },
    dispose() {
      client.dispose();
      serverConnection.dispose();
      clientToServer.end();
      serverToClient.end();
    },
  };
}
