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
  label: "broader-lane-readiness-style-recovery",
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
  label: "broader-lane-readiness-source-missing",
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
    styleProducer.boundedCheckerGate.promotionReviewCommand,
    "pnpm check:rust-checker-promotion-review",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.promotionReviewCommand,
    "pnpm check:rust-checker-promotion-review",
  );
  assert.equal(
    styleProducer.boundedCheckerGate.broaderRustLaneCommand,
    "pnpm check:rust-lane-bundle",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.broaderRustLaneCommand,
    "pnpm check:rust-lane-bundle",
  );
  assert.equal(styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustLaneBundle, 2);
  assert.equal(sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustLaneBundle, 2);
  assert.equal(styleProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustLaneBundle, true);
  assert.equal(styleProducer.boundedCheckerGate.includedInRustReleaseBundle, true);
  assert.equal(sourceProducer.boundedCheckerGate.includedInRustReleaseBundle, true);

  const minimumBoundedLaneCount =
    styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustLaneBundle;
  assert.equal(
    sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustLaneBundle,
    minimumBoundedLaneCount,
  );

  const readyForBroaderRustLanePromotionReview =
    CURRENT_BOUNDED_LANE_COUNT >= minimumBoundedLaneCount;

  process.stdout.write(
    [
      "== rust-checker-broader-lane-readiness:style-recovery ==",
      `bundle=${styleProducer.boundedCheckerGate.checkerBundle}`,
      `promotionReview=${styleProducer.boundedCheckerGate.promotionReviewCommand}`,
      `broaderRustLane=${styleProducer.boundedCheckerGate.broaderRustLaneCommand}`,
      `minimumBoundedLaneCount=${styleProducer.boundedCheckerGate.minimumBoundedLaneCountForRustLaneBundle}`,
      `currentBoundedLaneCount=${CURRENT_BOUNDED_LANE_COUNT}`,
      `readyForPromotionReview=${readyForBroaderRustLanePromotionReview}`,
      `includedInRustLaneBundle=${styleProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${styleProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
  process.stdout.write(
    [
      "== rust-checker-broader-lane-readiness:source-missing ==",
      `bundle=${sourceProducer.boundedCheckerGate.checkerBundle}`,
      `promotionReview=${sourceProducer.boundedCheckerGate.promotionReviewCommand}`,
      `broaderRustLane=${sourceProducer.boundedCheckerGate.broaderRustLaneCommand}`,
      `minimumBoundedLaneCount=${sourceProducer.boundedCheckerGate.minimumBoundedLaneCountForRustLaneBundle}`,
      `currentBoundedLaneCount=${CURRENT_BOUNDED_LANE_COUNT}`,
      `readyForPromotionReview=${readyForBroaderRustLanePromotionReview}`,
      `includedInRustLaneBundle=${sourceProducer.boundedCheckerGate.includedInRustLaneBundle}`,
      `includedInRustReleaseBundle=${sourceProducer.boundedCheckerGate.includedInRustReleaseBundle}`,
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
