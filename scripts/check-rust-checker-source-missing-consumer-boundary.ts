import { strict as assert } from "node:assert";
import path from "node:path";
import { runCheckerCli } from "../server/checker-cli/src";

const REPO_ROOT = process.cwd();
const WORKSPACE_ROOT = path.join(REPO_ROOT, "test/_fixtures/eslint-plugin-smoke");

const CASES = [
  {
    label: "missing-module",
    sourceFile: "src/MissingModule.jsx",
    code: "missing-module",
  },
  {
    label: "missing-static-class",
    sourceFile: "src/App.jsx",
    code: "missing-static-class",
  },
  {
    label: "missing-template-prefix",
    sourceFile: "src/TemplatePrefix.jsx",
    code: "missing-template-prefix",
  },
  {
    label: "missing-resolved-class-values",
    sourceFile: "src/Dynamic.jsx",
    code: "missing-resolved-class-values",
  },
  {
    label: "missing-resolved-class-domain",
    sourceFile: "src/DynamicDomain.jsx",
    code: "missing-resolved-class-domain",
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
          "--source-file",
          entry.sourceFile,
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
        payload.rustSourceMissingCanonicalProducer,
        `${entry.label}: missing rustSourceMissingCanonicalProducer`,
      );
      assert.ok(
        payload.rustSourceMissingConsistency,
        `${entry.label}: missing rustSourceMissingConsistency`,
      );
      assert.equal(
        payload.rustSourceMissingCanonicalProducer.canonicalCandidate.summary.total,
        1,
        `${entry.label}: expected one Rust producer finding`,
      );
      assert.equal(
        payload.rustSourceMissingCanonicalProducer.canonicalCandidate.findings[0]?.code,
        entry.code,
        `${entry.label}: unexpected Rust producer finding code`,
      );
      assert.equal(
        payload.rustSourceMissingCanonicalProducer.boundedCheckerGate.includedInRustReleaseBundle,
        false,
        `${entry.label}: release gate should remain false`,
      );
      assert.equal(
        payload.rustSourceMissingConsistency.findingsMatch,
        true,
        `${entry.label}: expected consistency match`,
      );
      assert.equal(
        payload.rustSourceMissingConsistency.countsMatch,
        true,
        `${entry.label}: expected consistency count match`,
      );

      return `== rust-checker-source-missing-consumer:${entry.label} ==\nvalidated code=${entry.code} consistent=true releaseGate=false\n\n`;
    }),
  );

  process.stdout.write(outputs.join(""));
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
