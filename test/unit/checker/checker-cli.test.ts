import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCheckerCli } from "../../../server/src/core/checker";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runCheckerCli", () => {
  it("fails on warnings by default and prints text output", async () => {
    const workspaceRoot = makeWorkspace({
      "src/App.tsx": [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const bad = cx('missing');",
        "",
      ].join("\n"),
      "src/Button.module.scss": ".button {}",
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCheckerCli([workspaceRoot], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      cwd: () => workspaceRoot,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("[warning] missing-static-class");
    expect(stdout.join("")).toContain("Checked 1 source files and 1 style modules.");
  });

  it("can emit json and ignore findings for exit status", async () => {
    const workspaceRoot = makeWorkspace({
      "src/Button.module.scss": ".unused {}",
    });
    const stdout: string[] = [];

    const exitCode = await runCheckerCli([workspaceRoot, "--format", "json", "--fail-on", "none"], {
      stdout: (message) => stdout.push(message),
      stderr: () => {},
      cwd: () => workspaceRoot,
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.summary).toMatchObject({ hints: 1, total: 1 });
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "unused-selector",
        }),
      ]),
    );
  });
});

function makeWorkspace(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "cme-checker-cli-"));
  tempDirs.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
  return root;
}
