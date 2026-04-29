import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const neovimDoc = readFileSync("docs/clients/neovim.md", "utf8");
const zedDoc = readFileSync("docs/clients/zed.md", "utf8");

for (const [label, doc] of [
  ["neovim", neovimDoc],
  ["zed", zedDoc],
] as const) {
  assert.match(doc, /omena-lsp-server/u, `${label}: must document the Rust LSP binary`);
  assert.match(doc, /dist\/bin\/<platform>-<arch>\/omena-lsp-server/u);
  assert.doesNotMatch(
    doc,
    /node.+dist\/server\/server\.js/su,
    `${label}: should not keep the Node LSP server as the primary multi-editor endpoint`,
  );
}

assert.match(neovimDoc, /vim\.lsp\.config/u);
assert.match(zedDoc, /language_servers/u);

process.stdout.write(
  [
    "validated omena-lsp-server multi-editor docs:",
    "clients=neovim,zed",
    "endpoint=dist/bin/<platform>-<arch>/omena-lsp-server",
  ].join(" "),
);
process.stdout.write("\n");
