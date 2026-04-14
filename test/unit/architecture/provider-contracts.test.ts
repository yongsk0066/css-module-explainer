import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(new URL("../../..", import.meta.url)));
const PROVIDERS_SRC = join(ROOT, "server/src/providers");

describe("provider contracts", () => {
  it("does not import binder internals directly from provider implementation files", () => {
    const files = listFiles(PROVIDERS_SRC)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => !file.endsWith("provider-deps.ts"));

    const hits = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return text.includes("/core/binder/") ? [`${relative(ROOT, file)} -> /core/binder/`] : [];
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
