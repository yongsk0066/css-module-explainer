import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(new URL("../../..", import.meta.url)));
const RUNTIME_SOURCE_ROOTS = [
  join(ROOT, "server/engine-host-node/src"),
  join(ROOT, "server/lsp-server/src"),
] as const;

describe("runtime cutover", () => {
  it("does not keep old semantic-graph-first helpers in runtime", () => {
    const files = RUNTIME_SOURCE_ROOTS.flatMap((dir) => listFiles(dir)).filter((file) =>
      file.endsWith(".ts"),
    );
    const forbidden = [
      "/core/semantic/graph-builder",
      "/core/semantic/reference-index",
      "/core/semantic/graph-types",
    ];

    const hits = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return forbidden
        .filter((needle) => text.includes(needle))
        .map((needle) => `${relative(ROOT, file)} -> ${needle}`);
    });

    expect(hits).toEqual([]);
  });
});

function listFiles(dir: string): readonly string[] {
  const entries = readdirSync(dir).map((name) => join(dir, name));
  const files: string[] = [];
  for (const entry of entries) {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      files.push(...listFiles(entry));
      continue;
    }
    files.push(entry);
  }
  return files;
}
