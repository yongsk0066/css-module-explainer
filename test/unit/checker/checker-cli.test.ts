import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCheckerCli } from "../../../server/checker-cli/src";

const tempDirs: string[] = [];
const STYLELINT_SMOKE_ROOT = path.join(process.cwd(), "test/_fixtures/stylelint-plugin-smoke");
const ESLINT_SMOKE_ROOT = path.join(process.cwd(), "test/_fixtures/eslint-plugin-smoke");

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
    expect(payload.reportVersion).toBe("1");
    expect(payload.tool).toBe("css-module-explainer/checker");
    expect(payload.workspaceRoot).toBe(workspaceRoot);
    expect(payload.filters).toEqual({
      preset: null,
      category: "all",
      severity: "all",
      includeBundles: [],
      includeCodes: [],
      excludeCodes: [],
    });
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
    expect(payload.filters).toEqual({
      preset: null,
      category: "style",
      severity: "hint",
      includeBundles: [],
      includeCodes: [],
      excludeCodes: [],
    });
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
    expect(payload.filters).toEqual({
      preset: null,
      category: "all",
      severity: "all",
      includeBundles: [],
      includeCodes: [],
      excludeCodes: [],
    });
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

  it("supports named code bundles", async () => {
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
      [workspaceRoot, "--include-bundle", "style-unused", "--format", "json", "--fail-on", "none"],
      {
        stdout: (message) => stdout.push(message),
        stderr: () => {},
        cwd: () => workspaceRoot,
      },
    );

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.filters).toEqual({
      preset: null,
      category: "all",
      severity: "all",
      includeBundles: ["style-unused"],
      includeCodes: ["unused-selector"],
      excludeCodes: [],
    });
    expect(payload.findings).toHaveLength(2);
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "unused-selector",
        }),
      ]),
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

    const exitCode = await runCheckerCli([workspaceRoot, "--preset", "ci", "--format", "json"], {
      stdout: (message) => stdout.push(message),
      stderr: () => {},
      cwd: () => workspaceRoot,
    });

    expect(exitCode).toBe(1);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.filters).toEqual({
      preset: "ci",
      category: "all",
      severity: "warning",
      includeBundles: ["ci-default"],
      includeCodes: [
        "missing-module",
        "missing-static-class",
        "missing-template-prefix",
        "missing-resolved-class-values",
        "missing-resolved-class-domain",
        "missing-composed-module",
        "missing-composed-selector",
        "missing-value-module",
        "missing-imported-value",
        "missing-keyframes",
      ],
      excludeCodes: [],
    });
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "source",
          code: "missing-static-class",
        }),
      ]),
    );
  });

  it("emits analysis metadata in json findings for dynamic source misses", async () => {
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
    const stdout: string[] = [];

    const exitCode = await runCheckerCli([workspaceRoot, "--format", "json", "--fail-on", "none"], {
      stdout: (message) => stdout.push(message),
      stderr: () => {},
      cwd: () => workspaceRoot,
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "source",
          code: "missing-resolved-class-values",
          analysisReason: "analysis preserved multiple finite candidate values",
          valueCertaintyShapeLabel: "bounded finite (2)",
        }),
      ]),
    );
  });

  it("uses compact output and style bundles for changed-style preset", async () => {
    const workspaceRoot = makeWorkspace({
      "src/Button.module.scss": ".button {}\n.unused {}",
    });
    const stdout: string[] = [];

    const exitCode = await runCheckerCli([workspaceRoot, "--preset", "changed-style"], {
      stdout: (message) => stdout.push(message),
      stderr: () => {},
      cwd: () => workspaceRoot,
    });

    expect(exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("src/Button.module.scss (2)");
    expect(output).toContain("hint unused-selector");
    expect(output).toContain(
      "Checked 0 source files and 1 style modules. 2 findings (0 warnings, 2 hints).",
    );
  });

  it("lets explicit include selection override preset bundle defaults", async () => {
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
        "--include-code",
        "missing-static-class",
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
    expect(payload.filters).toEqual({
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: [],
      includeCodes: ["missing-static-class"],
      excludeCodes: [],
    });
    expect(payload.findings).toEqual([]);
  });

  it("prints available code bundles", async () => {
    const workspaceRoot = makeWorkspace({});
    const stdout: string[] = [];

    const exitCode = await runCheckerCli([workspaceRoot, "--list-bundles"], {
      stdout: (message) => stdout.push(message),
      stderr: () => {},
      cwd: () => workspaceRoot,
    });

    expect(exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("ci-default:");
    expect(output).toContain("source-missing:");
    expect(output).toContain("style-recovery:");
    expect(output).toContain("style-unused:");
  });

  it("emits rust style-recovery producer and consistency in json output", async () => {
    const stdout: string[] = [];

    const exitCode = await runCheckerCli(
      [
        STYLELINT_SMOKE_ROOT,
        "--style-file",
        "src/ValueMissingModule.module.css",
        "--preset",
        "changed-style",
        "--include-bundle",
        "style-recovery",
        "--format",
        "json",
        "--fail-on",
        "none",
        "--rust-style-recovery-consumer",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: () => {},
        cwd: () => STYLELINT_SMOKE_ROOT,
      },
    );

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.rustStyleRecoveryCanonicalProducer).toMatchObject({
      canonicalCandidate: {
        bundle: "style-recovery",
        summary: { total: 1 },
        findings: [
          expect.objectContaining({
            code: "missing-value-module",
          }),
        ],
      },
      boundedCheckerGate: {
        consumerBoundaryCommand: "pnpm check:rust-checker-style-recovery-consumer-boundary",
        boundedCheckerLaneCommand: "pnpm check:rust-checker-bounded-lanes",
        promotionReviewCommand: "pnpm check:rust-checker-promotion-review",
        broaderRustLaneCommand: "pnpm check:rust-lane-bundle",
        minimumBoundedLaneCountForRustLaneBundle: 2,
        checkerBundle: "style-recovery",
        includedInRustReleaseBundle: false,
      },
    });
    expect(payload.rustStyleRecoveryConsistency).toEqual({
      schemaVersion: "0",
      bundle: "style-recovery",
      tsFindingCount: 1,
      rustFindingCount: 1,
      countsMatch: true,
      findingsMatch: true,
      mismatchedCodes: [],
    });
  }, 15000);

  it("prints rust style-recovery consistency summary in text output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCheckerCli(
      [
        STYLELINT_SMOKE_ROOT,
        "--style-file",
        "src/KeyframesMissing.module.css",
        "--preset",
        "changed-style",
        "--include-bundle",
        "style-recovery",
        "--fail-on",
        "none",
        "--rust-style-recovery-consumer",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
        cwd: () => STYLELINT_SMOKE_ROOT,
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain(
      "Rust style-recovery consumer: findings=1 consistent=true releaseGate=false",
    );
  }, 15000);

  it("emits rust source-missing producer and consistency in json output", async () => {
    const stdout: string[] = [];

    const exitCode = await runCheckerCli(
      [
        ESLINT_SMOKE_ROOT,
        "--source-file",
        "src/MissingModule.jsx",
        "--preset",
        "changed-source",
        "--include-bundle",
        "source-missing",
        "--format",
        "json",
        "--fail-on",
        "none",
        "--rust-source-missing-consumer",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: () => {},
        cwd: () => ESLINT_SMOKE_ROOT,
      },
    );

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.rustSourceMissingCanonicalProducer).toMatchObject({
      canonicalCandidate: {
        bundle: "source-missing",
        summary: { total: 1 },
        findings: [
          expect.objectContaining({
            code: "missing-module",
          }),
        ],
      },
      boundedCheckerGate: {
        consumerBoundaryCommand: "pnpm check:rust-checker-source-missing-consumer-boundary",
        boundedCheckerLaneCommand: "pnpm check:rust-checker-bounded-lanes",
        promotionReviewCommand: "pnpm check:rust-checker-promotion-review",
        broaderRustLaneCommand: "pnpm check:rust-lane-bundle",
        minimumBoundedLaneCountForRustLaneBundle: 2,
        checkerBundle: "source-missing",
        includedInRustReleaseBundle: false,
      },
    });
    expect(payload.rustSourceMissingConsistency).toEqual({
      schemaVersion: "0",
      bundle: "source-missing",
      tsFindingCount: 1,
      rustFindingCount: 1,
      countsMatch: true,
      findingsMatch: true,
      mismatchedCodes: [],
    });
  }, 15000);

  it("prints rust source-missing consistency summary in text output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCheckerCli(
      [
        ESLINT_SMOKE_ROOT,
        "--source-file",
        "src/App.jsx",
        "--preset",
        "changed-source",
        "--include-bundle",
        "source-missing",
        "--fail-on",
        "none",
        "--rust-source-missing-consumer",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
        cwd: () => ESLINT_SMOKE_ROOT,
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain(
      "Rust source-missing consumer: findings=1 consistent=true releaseGate=false",
    );
  }, 15000);
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
