import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEMANTIC_SMOKE_CORPUS } from "../../../scripts/semantic-smoke-corpus";

describe("semantic smoke corpus", () => {
  it("uses unique labels", () => {
    const labels = SEMANTIC_SMOKE_CORPUS.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("uses known checker presets", () => {
    for (const entry of SEMANTIC_SMOKE_CORPUS) {
      const presetIndex = entry.argv.indexOf("--preset");
      expect(presetIndex).toBeGreaterThanOrEqual(0);
      const preset = entry.argv[presetIndex + 1];
      expect(["ci", "changed-style", "changed-source"]).toContain(preset);
    }
  });

  it("resolves changed-file entries to existing repo files", () => {
    for (const entry of SEMANTIC_SMOKE_CORPUS) {
      const changedFileIndex = entry.argv.indexOf("--changed-file");
      if (changedFileIndex < 0) continue;
      const relativePath = entry.argv[changedFileIndex + 1];
      expect(relativePath).toBeTruthy();
      expect(existsSync(path.resolve(process.cwd(), relativePath!))).toBe(true);
    }
  });
});
