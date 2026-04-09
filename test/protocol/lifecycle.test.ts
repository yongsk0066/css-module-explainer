import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server.js";

describe("lifecycle", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns capabilities including definitionProvider on initialize", async () => {
    client = createInProcessServer();
    const result = await client.initialize();
    expect(result.capabilities.definitionProvider).toBe(true);
    expect(result.serverInfo?.name).toBe("css-module-explainer");
  });

  it("completes the initialize → initialized → shutdown handshake cleanly", async () => {
    client = createInProcessServer();
    await client.initialize();
    client.initialized();
    await client.shutdown();
    client.exit();
    // Resource cleanup happens in afterEach; no throw = success.
  });

  it("handles definition requests before initialize as null (deps not built yet)", async () => {
    client = createInProcessServer();
    const result = await client.definition({
      textDocument: { uri: "file:///never/opened.tsx" },
      position: { line: 0, character: 0 },
    });
    expect(result).toBeNull();
  });
});
