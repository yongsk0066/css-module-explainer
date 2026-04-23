import { strict as assert } from "node:assert";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import { runCheckerCli } from "../server/checker-cli/src";
import {
  deriveTsCheckerStyleUnusedCanonicalCandidate,
  STYLE_UNUSED_ENTRY,
  STYLE_UNUSED_WORKSPACE_ROOT,
} from "./rust-checker-style-unused-shared";
import { runShadowCheckerStyleUnusedCanonicalProducer } from "./rust-shadow-shared";

void (async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCheckerCli(
    [
      STYLE_UNUSED_WORKSPACE_ROOT,
      "--source-file",
      "src/App.tsx",
      "--style-file",
      "src/App.module.css",
      "--preset",
      "changed-style",
      "--include-bundle",
      "style-unused",
      "--format",
      "json",
      "--fail-on",
      "none",
      "--rust-style-unused-consumer",
    ],
    {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      cwd: () => STYLE_UNUSED_WORKSPACE_ROOT,
    },
  );

  assert.equal(exitCode, 0, "expected zero exit");
  assert.equal(stderr.join(""), "", "unexpected stderr");
  const payload = JSON.parse(stdout.join(""));
  assert.equal(payload.summary.total, 1, "expected one style-unused finding");
  assert.equal(payload.findings[0]?.code, "unused-selector", "unexpected finding code");
  assert.ok(payload.rustStyleUnusedCanonicalProducer, "missing rustStyleUnusedCanonicalProducer");
  assert.ok(payload.rustStyleUnusedConsistency, "missing rustStyleUnusedConsistency");

  const snapshot = await buildContractParitySnapshot(STYLE_UNUSED_ENTRY);
  const expectedCandidate = deriveTsCheckerStyleUnusedCanonicalCandidate(snapshot);
  const actualProducer = await runShadowCheckerStyleUnusedCanonicalProducer(snapshot);
  assert.deepEqual(actualProducer.canonicalCandidate, expectedCandidate);
  assert.equal(actualProducer.canonicalCandidate.summary.total, payload.summary.total);
  assert.equal(actualProducer.canonicalCandidate.findings[0]?.code, payload.findings[0]?.code);
  assert.deepEqual(payload.rustStyleUnusedCanonicalProducer.canonicalCandidate, expectedCandidate);
  assert.equal(
    payload.rustStyleUnusedCanonicalProducer.boundedCheckerGate.includedInRustReleaseBundle,
    true,
    "release gate should be true",
  );
  assert.equal(payload.rustStyleUnusedConsistency.findingsMatch, true);
  assert.equal(payload.rustStyleUnusedConsistency.countsMatch, true);

  process.stdout.write(
    "== rust-checker-style-unused-consumer:stylelint-smoke-unused-selector ==\nvalidated code=unused-selector consistent=true releaseGate=true\n\n",
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
