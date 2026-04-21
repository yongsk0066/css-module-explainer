import { strict as assert } from "node:assert";
import path from "node:path";
import { runCheckerCli } from "../server/checker-cli/src";

const REPO_ROOT = process.cwd();
const WORKSPACE_ROOT = path.join(REPO_ROOT, "test/_fixtures/stylelint-plugin-smoke");

const CASES = [
  {
    label: "composes-missing-module",
    styleFile: "src/ComposesMissingModule.module.css",
    code: "missing-composed-module",
  },
  {
    label: "composes-missing-selector",
    styleFile: "src/ComposesMissingSelector.module.css",
    code: "missing-composed-selector",
  },
  {
    label: "value-missing-module",
    styleFile: "src/ValueMissingModule.module.css",
    code: "missing-value-module",
  },
  {
    label: "value-missing-imported",
    styleFile: "src/ValueMissingImported.module.css",
    code: "missing-imported-value",
  },
  {
    label: "keyframes-missing",
    styleFile: "src/KeyframesMissing.module.css",
    code: "missing-keyframes",
  },
] as const;

void (async () => {
  const outputs = await Promise.all(
    CASES.map(async (entry) => {
      const stdout: string[] = [];
      const stderr: string[] = [];

      const exitCode = await runCheckerCli(
        [
          WORKSPACE_ROOT,
          "--style-file",
          entry.styleFile,
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
          stderr: (message) => stderr.push(message),
          cwd: () => WORKSPACE_ROOT,
        },
      );

      assert.equal(exitCode, 0, `${entry.label}: expected zero exit`);
      assert.equal(stderr.join(""), "", `${entry.label}: unexpected stderr`);

      const payload = JSON.parse(stdout.join(""));
      assert.equal(payload.summary.total, 1, `${entry.label}: expected one finding`);
      assert.equal(payload.findings.length, 1, `${entry.label}: expected one JSON finding`);
      assert.equal(
        payload.findings[0]?.code,
        entry.code,
        `${entry.label}: unexpected TS finding code`,
      );
      assert.ok(
        payload.rustStyleRecoveryCanonicalProducer,
        `${entry.label}: missing rustStyleRecoveryCanonicalProducer`,
      );
      assert.equal(
        payload.rustStyleRecoveryCanonicalProducer.canonicalCandidate.summary.total,
        1,
        `${entry.label}: expected one Rust producer finding`,
      );
      assert.equal(
        payload.rustStyleRecoveryCanonicalProducer.canonicalCandidate.findings[0]?.code,
        entry.code,
        `${entry.label}: unexpected Rust producer finding code`,
      );
      assert.equal(
        payload.rustStyleRecoveryCanonicalProducer.boundedCheckerGate.includedInRustReleaseBundle,
        false,
        `${entry.label}: release gate should remain false`,
      );

      return `== rust-checker-style-recovery-consumer:${entry.label} ==\nvalidated code=${entry.code} releaseGate=false\n\n`;
    }),
  );

  process.stdout.write(outputs.join(""));
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
