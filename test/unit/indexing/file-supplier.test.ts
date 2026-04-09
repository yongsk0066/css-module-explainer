import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scssFileSupplier } from "../../../server/src/core/indexing/file-supplier.js";
import { buildStyleFileWatcherGlob } from "../../../server/src/core/scss/lang-registry.js";
import type { FileTask } from "../../../server/src/core/indexing/indexer-worker.js";

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
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "src", "Button.module.scss"), ".a {}");
    writeFileSync(join(root, "src", "Form.module.css"), ".b {}");
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
    expect(sorted).toHaveLength(2);
    expect(sorted[0]).toMatch(/Button\.module\.scss$/);
    expect(sorted[1]).toMatch(/Form\.module\.css$/);
    for (const task of tasks) {
      expect(task.kind).toBe("scss");
    }
  });
});
