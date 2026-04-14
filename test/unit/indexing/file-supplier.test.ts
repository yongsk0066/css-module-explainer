import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scssFileSupplier } from "../../../server/src/core/indexing/file-supplier";
import { buildStyleFileWatcherGlob } from "../../../server/src/core/scss/lang-registry";
import type { FileTask } from "../../../server/src/core/indexing/indexer-worker";

const noopLogger = { error: () => {} };

describe("buildStyleFileWatcherGlob", () => {
  it("covers every registered style module extension", () => {
    const glob = buildStyleFileWatcherGlob();
    expect(glob).toMatch(/module\.(scss|css)|module\.\{/);
  });
});

describe("scssFileSupplier", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "cme-supplier-"));
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "packages", "nested", "src"), { recursive: true });
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "src", "Button.module.scss"), ".a {}");
    writeFileSync(join(root, "src", "Form.module.css"), ".b {}");
    writeFileSync(join(root, "packages", "nested", "src", "Nested.module.scss"), ".n {}");
    writeFileSync(join(root, "src", "plain.scss"), ".c {}"); // non-module, ignored
    writeFileSync(join(root, "node_modules", "pkg", "vendor.module.scss"), ".d {}"); // ignored
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("yields only .module.{scss,css} files outside node_modules", async () => {
    const tasks: FileTask[] = [];
    for await (const task of scssFileSupplier(root, noopLogger)) {
      tasks.push(task);
    }
    const sorted = tasks.map((t) => t.path).toSorted();
    expect(sorted).toHaveLength(3);
    expect(sorted.some((path) => path.endsWith("Button.module.scss"))).toBe(true);
    expect(sorted.some((path) => path.endsWith("Form.module.css"))).toBe(true);
    expect(sorted.some((path) => path.endsWith("Nested.module.scss"))).toBe(true);
  });

  it("supports ownership filtering for nested workspace roots", async () => {
    const nestedRoot = join(root, "packages", "nested");
    const tasks: FileTask[] = [];
    for await (const task of scssFileSupplier(
      root,
      noopLogger,
      (path) => !path.startsWith(nestedRoot),
    )) {
      tasks.push(task);
    }
    const sorted = tasks.map((t) => t.path).toSorted();
    expect(sorted).toHaveLength(2);
    expect(sorted.some((path) => path.endsWith("Nested.module.scss"))).toBe(false);
  });
});
