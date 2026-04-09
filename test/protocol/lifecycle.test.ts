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
    expect(result.capabilities.hoverProvider).toBe(true);
    expect(result.serverInfo?.name).toBe("css-module-explainer");
  });

  it("advertises completionProvider with every Plan 08 trigger character", async () => {
    client = createInProcessServer();
    const result = await client.initialize();
    const provider = result.capabilities.completionProvider;
    expect(provider).toBeDefined();
    expect(provider?.triggerCharacters).toEqual(["'", '"', "`", ","]);
    expect(provider?.resolveProvider).toBe(false);
  });

  it("completes the initialize → initialized → shutdown handshake cleanly", async () => {
    client = createInProcessServer();
    await client.initialize();
    client.initialized();
    await client.shutdown();
    client.exit();
    // Resource cleanup happens in afterEach; no throw = success.
  });

  it("returns null for a definition request on an unknown document", async () => {
    client = createInProcessServer();
    // No initialize, no didOpen — the server neither crashes nor
    // throws a JSON-RPC error. `null` is the agreed-upon
    // "nothing to say" shape (spec §2.8 + §4.2). This exercises
    // composition-root's toCursorParams unknown-doc branch, not
    // the pre-initialize `!deps` guard.
    const result = await client.definition({
      textDocument: { uri: "file:///never/opened.tsx" },
      position: { line: 0, character: 0 },
    });
    expect(result).toBeNull();
  });
});
