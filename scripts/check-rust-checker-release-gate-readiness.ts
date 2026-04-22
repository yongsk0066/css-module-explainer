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
const CURRENT_BOUNDED_LANE_COUNT = 2 as const;

const STYLE_RECOVERY_ENTRY: ContractParityEntry = {
  label: "release-gate-readiness-style-recovery",
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
  label: "release-gate-readiness-source-missing",
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
    styleProducer.boundedCheckerGate.promotionEvidenceCommand,
    "pnpm check:rust-checker-promotion-evidence",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.promotionEvidenceCommand,
    "pnpm check:rust-checker-promotion-evidence",
  );
  assert.equal(
    styleProducer.boundedCheckerGate.releaseGateReadinessCommand,
    "pnpm check:rust-checker-release-gate-readiness",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.releaseGateReadinessCommand,
    "pnpm check:rust-checker-release-gate-readiness",
  );
  assert.equal(styleProducer.boundedCheckerGate.releaseBundleCommand, "pnpm check:rust-release-bundle");
  assert.equal(sourceProducer.boundedCheckerGate.releaseBundleCommand, "pnpm check:rust-release-bundle");
  assert.equal(styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle, 2);
  assert.equal(sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle, 2);
  assert.equal(styleProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(styleProducer.boundedCheckerGate.includedInRustReleaseBundle, false);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustReleaseBundle, false);

  const minimumBoundedLaneCount =
    styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle;
  assert.equal(
    sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle,
    minimumBoundedLaneCount,
  );

  const readyForReleaseGateReview = CURRENT_BOUNDED_LANE_COUNT >= minimumBoundedLaneCount;

  process.stdout.write(
    [
      "== rust-checker-release-gate-readiness:style-recovery ==",
      `bundle=${styleProducer.boundedCheckerGate.checkerBundle}`,
      `promotionEvidence=${styleProducer.boundedCheckerGate.promotionEvidenceCommand}`,
      `releaseGateReadiness=${styleProducer.boundedCheckerGate.releaseGateReadinessCommand}`,
      `releaseBundle=${styleProducer.boundedCheckerGate.releaseBundleCommand}`,
      `minimumBoundedLaneCount=${styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle}`,
      `currentBoundedLaneCount=${CURRENT_BOUNDED_LANE_COUNT}`,
      `readyForReleaseGateReview=${readyForReleaseGateReview}`,
      `includedInRustLaneBundle=${styleProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${styleProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
  process.stdout.write(
    [
      "== rust-checker-release-gate-readiness:source-missing ==",
      `bundle=${sourceProducer.boundedCheckerGate.checkerBundle}`,
      `promotionEvidence=${sourceProducer.boundedCheckerGate.promotionEvidenceCommand}`,
      `releaseGateReadiness=${sourceProducer.boundedCheckerGate.releaseGateReadinessCommand}`,
      `releaseBundle=${sourceProducer.boundedCheckerGate.releaseBundleCommand}`,
      `minimumBoundedLaneCount=${sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle}`,
      `currentBoundedLaneCount=${CURRENT_BOUNDED_LANE_COUNT}`,
      `readyForReleaseGateReview=${readyForReleaseGateReview}`,
      `includedInRustLaneBundle=${sourceProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${sourceProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
