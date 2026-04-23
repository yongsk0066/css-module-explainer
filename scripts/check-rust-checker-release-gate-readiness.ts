import { strict as assert } from "node:assert";
import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  runShadowCheckerSourceMissingCanonicalProducer,
  runShadowCheckerStyleRecoveryCanonicalProducer,
  runShadowCheckerStyleUnusedCanonicalProducer,
} from "./rust-shadow-shared";
import { STYLE_UNUSED_ENTRY } from "./rust-checker-style-unused-shared";

const REPO_ROOT = process.cwd();
const STYLELINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/stylelint-plugin-smoke");
const ESLINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/eslint-plugin-smoke");
const CURRENT_BOUNDED_LANE_COUNT = 3 as const;

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
  const unusedSnapshot = await buildContractParitySnapshot(STYLE_UNUSED_ENTRY);

  const styleProducer = await runShadowCheckerStyleRecoveryCanonicalProducer(styleSnapshot);
  const sourceProducer = await runShadowCheckerSourceMissingCanonicalProducer(sourceSnapshot);
  const unusedProducer = await runShadowCheckerStyleUnusedCanonicalProducer(unusedSnapshot);

  assert.equal(
    styleProducer.boundedCheckerGate.promotionEvidenceCommand,
    "pnpm check:rust-checker-promotion-evidence",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.promotionEvidenceCommand,
    "pnpm check:rust-checker-promotion-evidence",
  );
  assert.equal(
    unusedProducer.boundedCheckerGate.promotionEvidenceCommand,
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
  assert.equal(
    unusedProducer.boundedCheckerGate.releaseGateReadinessCommand,
    "pnpm check:rust-checker-release-gate-readiness",
  );
  assert.equal(
    styleProducer.boundedCheckerGate.releaseGateShadowCommand,
    "pnpm check:rust-checker-release-gate-shadow",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.releaseGateShadowCommand,
    "pnpm check:rust-checker-release-gate-shadow",
  );
  assert.equal(
    unusedProducer.boundedCheckerGate.releaseGateShadowCommand,
    "pnpm check:rust-checker-release-gate-shadow",
  );
  assert.equal(
    styleProducer.boundedCheckerGate.releaseGateShadowReviewCommand,
    "pnpm check:rust-checker-release-gate-shadow-review",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.releaseGateShadowReviewCommand,
    "pnpm check:rust-checker-release-gate-shadow-review",
  );
  assert.equal(
    unusedProducer.boundedCheckerGate.releaseGateShadowReviewCommand,
    "pnpm check:rust-checker-release-gate-shadow-review",
  );
  assert.equal(
    styleProducer.boundedCheckerGate.releaseBundleCommand,
    "pnpm check:rust-release-bundle",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.releaseBundleCommand,
    "pnpm check:rust-release-bundle",
  );
  assert.equal(
    unusedProducer.boundedCheckerGate.releaseBundleCommand,
    "pnpm check:rust-release-bundle",
  );
  assert.equal(styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle, 3);
  assert.equal(sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle, 3);
  assert.equal(unusedProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle, 3);
  assert.equal(styleProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle, 3);
  assert.equal(
    sourceProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle,
    3,
  );
  assert.equal(
    unusedProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle,
    3,
  );
  assert.equal(styleProducer.boundedCheckerGate.releaseGateStage, "enforced");
  assert.equal(sourceProducer.boundedCheckerGate.releaseGateStage, "enforced");
  assert.equal(unusedProducer.boundedCheckerGate.releaseGateStage, "enforced");
  assert.equal(styleProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(unusedProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(styleProducer.boundedCheckerGate.includedInRustReleaseBundle, true);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustReleaseBundle, true);
  assert.equal(unusedProducer.boundedCheckerGate.includedInRustReleaseBundle, true);

  const minimumBoundedLaneCount =
    styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle;
  assert.equal(
    sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle,
    minimumBoundedLaneCount,
  );
  assert.equal(
    unusedProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle,
    minimumBoundedLaneCount,
  );

  const readyForReleaseGateReview = CURRENT_BOUNDED_LANE_COUNT >= minimumBoundedLaneCount;

  process.stdout.write(
    [
      "== rust-checker-release-gate-readiness:style-recovery ==",
      `bundle=${styleProducer.boundedCheckerGate.checkerBundle}`,
      `promotionEvidence=${styleProducer.boundedCheckerGate.promotionEvidenceCommand}`,
      `releaseGateReadiness=${styleProducer.boundedCheckerGate.releaseGateReadinessCommand}`,
      `releaseGateShadow=${styleProducer.boundedCheckerGate.releaseGateShadowCommand}`,
      `releaseGateShadowReview=${styleProducer.boundedCheckerGate.releaseGateShadowReviewCommand}`,
      `releaseBundle=${styleProducer.boundedCheckerGate.releaseBundleCommand}`,
      `minimumBoundedLaneCount=${styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle}`,
      `minimumSuccessfulShadowRuns=${styleProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle}`,
      `currentBoundedLaneCount=${CURRENT_BOUNDED_LANE_COUNT}`,
      `readyForReleaseGateReview=${readyForReleaseGateReview}`,
      `releaseGateStage=${styleProducer.boundedCheckerGate.releaseGateStage}`,
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
      `releaseGateShadow=${sourceProducer.boundedCheckerGate.releaseGateShadowCommand}`,
      `releaseGateShadowReview=${sourceProducer.boundedCheckerGate.releaseGateShadowReviewCommand}`,
      `releaseBundle=${sourceProducer.boundedCheckerGate.releaseBundleCommand}`,
      `minimumBoundedLaneCount=${sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle}`,
      `minimumSuccessfulShadowRuns=${sourceProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle}`,
      `currentBoundedLaneCount=${CURRENT_BOUNDED_LANE_COUNT}`,
      `readyForReleaseGateReview=${readyForReleaseGateReview}`,
      `releaseGateStage=${sourceProducer.boundedCheckerGate.releaseGateStage}`,
      `includedInRustLaneBundle=${sourceProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${sourceProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
  process.stdout.write(
    [
      "== rust-checker-release-gate-readiness:style-unused ==",
      `bundle=${unusedProducer.boundedCheckerGate.checkerBundle}`,
      `promotionEvidence=${unusedProducer.boundedCheckerGate.promotionEvidenceCommand}`,
      `releaseGateReadiness=${unusedProducer.boundedCheckerGate.releaseGateReadinessCommand}`,
      `releaseGateShadow=${unusedProducer.boundedCheckerGate.releaseGateShadowCommand}`,
      `releaseGateShadowReview=${unusedProducer.boundedCheckerGate.releaseGateShadowReviewCommand}`,
      `releaseBundle=${unusedProducer.boundedCheckerGate.releaseBundleCommand}`,
      `minimumBoundedLaneCount=${unusedProducer.boundedCheckerGate.minimumBoundedLaneCountForRustReleaseBundle}`,
      `minimumSuccessfulShadowRuns=${unusedProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle}`,
      `currentBoundedLaneCount=${CURRENT_BOUNDED_LANE_COUNT}`,
      `readyForReleaseGateReview=${readyForReleaseGateReview}`,
      `releaseGateStage=${unusedProducer.boundedCheckerGate.releaseGateStage}`,
      `includedInRustLaneBundle=${unusedProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${unusedProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
