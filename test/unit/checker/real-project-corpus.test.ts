import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REAL_PROJECT_CORPUS } from "../../../scripts/real-project-corpus";

describe("real project corpus", () => {
  it("uses unique labels", () => {
    const labels = REAL_PROJECT_CORPUS.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("uses the ci preset", () => {
    for (const entry of REAL_PROJECT_CORPUS) {
      const presetIndex = entry.argv.indexOf("--preset");
      expect(presetIndex).toBeGreaterThanOrEqual(0);
      expect(entry.argv[presetIndex + 1]).toBe("ci");
    }
  });

  it("resolves every explicit file to an existing repo path", () => {
    for (const entry of REAL_PROJECT_CORPUS) {
      for (let index = 0; index < entry.argv.length; index += 1) {
        const flag = entry.argv[index];
        if (flag !== "--source-file" && flag !== "--style-file") continue;
        const relativePath = entry.argv[index + 1];
        expect(relativePath).toBeTruthy();
        expect(existsSync(path.resolve(process.cwd(), relativePath!))).toBe(true);
      }
    }
  });
});
