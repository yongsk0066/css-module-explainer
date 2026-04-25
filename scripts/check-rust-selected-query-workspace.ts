import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runWorkspaceCheckCommand } from "../server/engine-host-node/src/checker-host";

const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "cme-rust-selected-query-workspace-"));

void (async () => {
  try {
    writeFixture(
      "src/App.tsx",
      [
        "import classNames from 'classnames/bind';",
        "import styles from './Button.module.scss';",
        "const cx = classNames.bind(styles);",
        "const size: 'small' | 'large' = Math.random() > 0.5 ? 'small' : 'large';",
        "const value = cx(size);",
        "",
      ].join("\n"),
    );
    writeFixture("src/Button.module.scss", [".small {}", ".unused {}"].join("\n"));

    const result = await runWorkspaceCheckCommand({
      workspace: {
        workspaceRoot,
        env: {
          ...process.env,
          CME_ENGINE_SHADOW_RUNNER: "prebuilt",
          CME_SELECTED_QUERY_BACKEND: "rust-selected-query",
        },
      },
      filters: {
        preset: null,
        category: "all",
        severity: "all",
        includeBundles: [],
        includeCodes: [],
        excludeCodes: [],
      },
    });

    const codes = result.checkerReport.findings.map((finding) => finding.code).toSorted();
    assert(codes.includes("missing-resolved-class-values"), `missing source finding: ${codes}`);
    assert(codes.includes("unused-selector"), `missing style finding: ${codes}`);

    process.stdout.write(
      `rust-selected-query workspace ok: findings=${result.checkerReport.summary.total} codes=${codes.join(",")}\n`,
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
})();

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(workspaceRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}
