import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runWorkspaceCheckCommand } from "../../../server/engine-host-node/src/checker-host";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runWorkspaceCheckCommand", () => {
  it("filters findings without consumer-facing report shaping", async () => {
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
        includeBundles: ["ci-default"],
        includeCodes: [],
        excludeCodes: ["unused-selector"],
      },
    });

    expect(result.workspaceCheck.summary).toEqual({ warnings: 1, hints: 0, total: 1 });
    expect(result.workspaceCheck.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: path.join(workspaceRoot, "src/App.tsx"),
          finding: expect.objectContaining({
            category: "source",
            code: "missing-static-class",
            severity: "warning",
          }),
        }),
      ]),
    );
    expect(result.checkerReport.version).toBe("1");
    expect(result.checkerReport.summary).toEqual({ warnings: 1, hints: 0, total: 1 });
    expect(result.checkerReport.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: path.join(workspaceRoot, "src/App.tsx"),
          category: "source",
          code: "missing-static-class",
          severity: "warning",
          message: expect.any(String),
        }),
      ]),
    );
  });

  it("includes analysis metadata for dynamic source findings in checker reports", async () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const size: 'small' | 'large' = Math.random() > 0.5 ? 'small' : 'large';",
        "const bad = cx(size);",
        "",
      ].join("\n"),
      "src/Button.module.scss": ".small {}",
    });

    const result = await runWorkspaceCheckCommand({
      workspace: { workspaceRoot },
      filters: {
        preset: null,
        category: "all",
        severity: "all",
        includeBundles: [],
        includeCodes: [],
        excludeCodes: [],
      },
    });

    expect(result.checkerReport.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: path.join(workspaceRoot, "src/App.tsx"),
          category: "source",
          code: "missing-resolved-class-values",
          analysisReason: "analysis preserved multiple finite candidate values",
          valueCertaintyShapeLabel: "bounded finite (2)",
        }),
      ]),
    );
  });

  it("keeps workspace checker options when routed through diagnostics boundaries", async () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const ok = cx('button');",
        "",
      ].join("\n"),
      "src/Button.module.scss": ".button {}\n.unused {}",
    });

    const result = await runWorkspaceCheckCommand({
      workspace: { workspaceRoot, includeUnusedSelectors: false },
      filters: {
        preset: null,
        category: "all",
        severity: "all",
        includeBundles: [],
        includeCodes: [],
        excludeCodes: [],
      },
    });

    expect(result.workspaceCheck.summary).toEqual({ warnings: 0, hints: 0, total: 0 });
    expect(result.workspaceCheck.findings).toEqual([]);
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
