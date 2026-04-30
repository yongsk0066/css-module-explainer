import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import { createServer } from "../../server/lsp-server/src/composition-root";
import type { FileTask } from "../../server/engine-core-ts/src/core/indexing/indexer-worker";

/**
 * Empty AsyncIterable factory used to keep the indexer worker
 * idle — tests here exercise construction only, not file
 * walking.
 */
function emptySupplier(): AsyncIterable<FileTask> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<FileTask> {
      return {
        next: () => Promise.resolve({ done: true, value: undefined as never }),
      };
    },
  };
}

describe("createServer transport discriminated union", () => {
  // Auto-transport construction requires the LanguageClient's
  // argv flags (`--node-ipc` / `--stdio`) to wire stdin/stdout.
  // Under vitest those flags are absent, so `createConnection`
  // throws a well-defined error. Asserting that shape documents
  // the contract — the discriminated-union branch is exercised,
  // even though the test environment cannot complete startup.
  it("routes the default shape (no transport field) through the auto branch", () => {
    expect(() =>
      createServer({
        fileSupplier: () => emptySupplier(),
        readStyleFileAsync: () => Promise.resolve(null),
      }),
    ).toThrow(/Connection input stream is not set/);
  });

  it("routes an explicit `transport: 'auto'` through the auto branch", () => {
    expect(() =>
      createServer({
        transport: "auto",
        fileSupplier: () => emptySupplier(),
        readStyleFileAsync: () => Promise.resolve(null),
      }),
    ).toThrow(/Connection input stream is not set/);
  });

  it("routes `transport: 'streams'` through the streams branch with no cast", () => {
    const serverToClient = new PassThrough();
    const clientToServer = new PassThrough();
    const reader = new StreamMessageReader(clientToServer);
    const writer = new StreamMessageWriter(serverToClient);
    const created = createServer({
      transport: "streams",
      reader,
      writer,
      fileSupplier: () => emptySupplier(),
      readStyleFileAsync: () => Promise.resolve(null),
    });
    expect(created.connection).toBeDefined();
    expect(created.documents).toBeDefined();
    created.connection.dispose();
  });
});
