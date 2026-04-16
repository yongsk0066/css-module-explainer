import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runWorkspaceCheckCommand } from "../../../server/src/core/checker";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runWorkspaceCheckCommand", () => {
  it("filters findings and emits stable JSON report metadata", async () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const bad = cx('missing');",
        "",
      ].join("\n"),
      "src/Button.module.scss": ".button {}\n.unused {}",
    });

    const result = await runWorkspaceCheckCommand({
      workspace: { workspaceRoot },
      filters: {
        preset: "ci",
        category: "all",
        severity: "warning",
        includeCodes: [],
        excludeCodes: ["unused-selector"],
      },
    });

    expect(result.workspaceCheck.summary).toEqual({ warnings: 1, hints: 0, total: 1 });
    expect(result.jsonReport.workspaceRoot).toBe(workspaceRoot);
    expect(result.jsonReport.filters).toEqual({
      preset: "ci",
      category: "all",
      severity: "warning",
      includeCodes: [],
      excludeCodes: ["unused-selector"],
    });
    expect(result.jsonReport.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "source",
          code: "missing-static-class",
          severity: "warning",
        }),
      ]),
    );
  });
});

function makeWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "checker-command-"));
  tempDirs.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return root;
}
