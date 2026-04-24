import { test, expect } from "../_fixtures/protocol";

test("returns capabilities including definitionProvider on initialize", async ({ makeClient }) => {
  const client = makeClient();
  const result = await client.initialize();
  expect(result.capabilities.definitionProvider).toBe(true);
  expect(result.capabilities.hoverProvider).toBe(true);
  expect(result.serverInfo?.name).toBe("css-module-explainer");
});

test("advertises completionProvider with every trigger character", async ({ makeClient }) => {
  const client = makeClient();
  const result = await client.initialize();
  const provider = result.capabilities.completionProvider;
  expect(provider).toBeDefined();
  expect(provider?.triggerCharacters).toEqual(["'", '"', "`", ",", ".", "$", "@"]);
  expect(provider?.resolveProvider).toBe(false);
});

test("completes the initialize → initialized → shutdown handshake cleanly", async ({
  makeClient,
}) => {
  const client = makeClient();
  await client.initialize();
  client.initialized();
  await client.shutdown();
  client.exit();
});

test("returns null for a definition request on an unknown document", async ({ makeClient }) => {
  const client = makeClient();
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
