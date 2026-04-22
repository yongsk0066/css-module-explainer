import { strict as assert } from "node:assert";
import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  runShadowCheckerSourceMissingCanonicalProducer,
  runShadowCheckerStyleRecoveryCanonicalProducer,
} from "./rust-shadow-shared";

const REPO_ROOT = process.cwd();
const STYLELINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/stylelint-plugin-smoke");
const ESLINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/eslint-plugin-smoke");

const STYLE_RECOVERY_ENTRY: ContractParityEntry = {
  label: "promotion-review-style-recovery",
  workspace: {
    workspaceRoot: STYLELINT_SMOKE_ROOT,
    sourceFilePaths: [],
    styleFilePaths: [path.join(STYLELINT_SMOKE_ROOT, "src/ComposesMissingModule.module.css")],
  },
  filters: {
    preset: "changed-style",
    category: "style",
    severity: "all",
    includeBundles: ["style-recovery"],
    includeCodes: [],
    excludeCodes: [],
  },
};

const SOURCE_MISSING_ENTRY: ContractParityEntry = {
  label: "promotion-review-source-missing",
  workspace: {
    workspaceRoot: ESLINT_SMOKE_ROOT,
    sourceFilePaths: [path.join(ESLINT_SMOKE_ROOT, "src/MissingModule.jsx")],
    styleFilePaths: [],
  },
  filters: {
    preset: "changed-source",
    category: "source",
    severity: "all",
    includeBundles: ["source-missing"],
    includeCodes: [],
    excludeCodes: [],
  },
};

void (async () => {
  const styleSnapshot = await buildContractParitySnapshot(STYLE_RECOVERY_ENTRY);
  const sourceSnapshot = await buildContractParitySnapshot(SOURCE_MISSING_ENTRY);

  const styleProducer = await runShadowCheckerStyleRecoveryCanonicalProducer(styleSnapshot);
  const sourceProducer = await runShadowCheckerSourceMissingCanonicalProducer(sourceSnapshot);

  assert.equal(
    styleProducer.boundedCheckerGate.consumerBoundaryCommand,
    "pnpm check:rust-checker-style-recovery-consumer-boundary",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.consumerBoundaryCommand,
    "pnpm check:rust-checker-source-missing-consumer-boundary",
  );
  assert.equal(
    styleProducer.boundedCheckerGate.boundedCheckerLaneCommand,
    "pnpm check:rust-checker-bounded-lanes",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.boundedCheckerLaneCommand,
    "pnpm check:rust-checker-bounded-lanes",
  );
  assert.equal(styleProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(styleProducer.boundedCheckerGate.includedInRustReleaseBundle, true);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustReleaseBundle, true);

  process.stdout.write(
    [
      "== rust-checker-promotion-review:style-recovery ==",
      `bundle=${styleProducer.boundedCheckerGate.checkerBundle}`,
      `consumerBoundary=${styleProducer.boundedCheckerGate.consumerBoundaryCommand}`,
      `lane=${styleProducer.boundedCheckerGate.boundedCheckerLaneCommand}`,
      `includedInRustLaneBundle=${styleProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${styleProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
  process.stdout.write(
    [
      "== rust-checker-promotion-review:source-missing ==",
      `bundle=${sourceProducer.boundedCheckerGate.checkerBundle}`,
      `consumerBoundary=${sourceProducer.boundedCheckerGate.consumerBoundaryCommand}`,
      `lane=${sourceProducer.boundedCheckerGate.boundedCheckerLaneCommand}`,
      `includedInRustLaneBundle=${sourceProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${sourceProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
