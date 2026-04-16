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
    expect(payload.schemaVersion).toBe("1");
    expect(payload.tool).toBe("css-module-explainer/checker");
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

  it("supports changed-file routing and category filtering", async () => {
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
    const stdout: string[] = [];

    const exitCode = await runCheckerCli(
      [
        workspaceRoot,
        "--changed-file",
        "src/Button.module.scss",
        "--category",
        "style",
        "--severity",
        "hint",
        "--format",
        "json",
        "--fail-on",
        "none",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: () => {},
        cwd: () => workspaceRoot,
      },
    );

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.sourceFiles).toEqual([]);
    expect(payload.styleFiles).toEqual([path.join(workspaceRoot, "src/Button.module.scss")]);
    expect(payload.summary).toMatchObject({ warnings: 0, hints: 2, total: 2 });
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          severity: "hint",
          code: "unused-selector",
        }),
      ]),
    );
  });

  it("supports stdin file lists", async () => {
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

    const exitCode = await runCheckerCli(
      [workspaceRoot, "--stdin-file-list", "--format", "json", "--fail-on", "none"],
      {
        stdout: (message) => stdout.push(message),
        stderr: () => {},
        cwd: () => workspaceRoot,
        stdin: async () => "src/App.tsx\n# comment\n",
      },
    );

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.sourceFiles).toEqual([path.join(workspaceRoot, "src/App.tsx")]);
    expect(payload.styleFiles).toEqual([]);
    expect(payload.summary).toMatchObject({ warnings: 1, hints: 0, total: 1 });
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "source",
          code: "missing-static-class",
        }),
      ]),
    );
  });

  it("supports summary-only text output and code filters", async () => {
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
    const stdout: string[] = [];

    const exitCode = await runCheckerCli(
      [
        workspaceRoot,
        "--include-code",
        "missing-static-class",
        "--exclude-code",
        "unused-selector",
        "--summary",
        "--fail-on",
        "none",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: () => {},
        cwd: () => workspaceRoot,
      },
    );

    expect(exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).not.toContain("[warning] missing-static-class");
    expect(output).not.toContain("unused-selector");
    expect(output).toContain(
      "Checked 1 source files and 1 style modules. 1 findings (1 warnings, 0 hints).",
    );
  });

  it("applies the ci preset defaults", async () => {
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
    const stdout: string[] = [];

    const exitCode = await runCheckerCli([workspaceRoot, "--preset", "ci"], {
      stdout: (message) => stdout.push(message),
      stderr: () => {},
      cwd: () => workspaceRoot,
    });

    expect(exitCode).toBe(1);
    const output = stdout.join("");
    expect(output).not.toContain("[warning] missing-static-class");
    expect(output).not.toContain("unused-selector");
    expect(output).toContain(
      "Checked 1 source files and 1 style modules. 1 findings (1 warnings, 0 hints).",
    );
  });

  it("lets explicit flags override preset defaults", async () => {
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
    const stdout: string[] = [];

    const exitCode = await runCheckerCli(
      [
        workspaceRoot,
        "--preset",
        "changed-style",
        "--category",
        "all",
        "--format",
        "json",
        "--fail-on",
        "none",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: () => {},
        cwd: () => workspaceRoot,
      },
    );

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "source",
          code: "missing-static-class",
        }),
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
