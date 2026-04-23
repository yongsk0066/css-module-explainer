import { deepStrictEqual } from "node:assert";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  deriveTsCheckerStyleUnusedCanonicalCandidate,
  STYLE_UNUSED_ENTRY,
} from "./rust-checker-style-unused-shared";
import {
  runShadowCheckerStyleUnusedCanonicalProducer,
  type CheckerStyleUnusedCanonicalProducerSignalV0,
} from "./rust-shadow-shared";

void (async () => {
  process.stdout.write(`== rust-checker-style-unused-producer:${STYLE_UNUSED_ENTRY.label} ==\n`);
  const snapshot = await buildContractParitySnapshot(STYLE_UNUSED_ENTRY);
  const canonicalCandidate = deriveTsCheckerStyleUnusedCanonicalCandidate(snapshot);
  const actual = await runShadowCheckerStyleUnusedCanonicalProducer(snapshot);

  const expected: CheckerStyleUnusedCanonicalProducerSignalV0 = {
    schemaVersion: "0",
    inputVersion: canonicalCandidate.inputVersion,
    canonicalCandidate,
    boundedCheckerGate: {
      canonicalCandidateCommand: "pnpm check:rust-checker-style-unused-canonical-candidate",
      canonicalProducerCommand: "pnpm check:rust-checker-style-unused-canonical-producer",
      consumerBoundaryCommand: "pnpm check:rust-checker-style-unused-consumer-boundary",
      boundedCheckerLaneCommand: "pnpm check:rust-checker-bounded-lanes",
      promotionReviewCommand: "pnpm check:rust-checker-promotion-review",
      promotionEvidenceCommand: "pnpm check:rust-checker-promotion-evidence",
      broaderRustLaneCommand: "pnpm check:rust-lane-bundle",
      releaseGateReadinessCommand: "pnpm check:rust-checker-release-gate-readiness",
      releaseGateShadowCommand: "pnpm check:rust-checker-release-gate-shadow",
      releaseGateShadowReviewCommand: "pnpm check:rust-checker-release-gate-shadow-review",
      releaseBundleCommand: "pnpm check:rust-release-bundle",
      minimumBoundedLaneCountForRustLaneBundle: 3,
      minimumBoundedLaneCountForRustReleaseBundle: 3,
      minimumSuccessfulShadowRunsForRustReleaseBundle: 3,
      checkerBundle: "style-unused",
      releaseGateStage: "candidate",
      includedInRustLaneBundle: false,
      includedInRustReleaseBundle: false,
    },
  };

  deepStrictEqual(actual, expected, "checker style-unused canonical producer mismatch");
  process.stdout.write(
    `findings=${actual.canonicalCandidate.summary.total} releaseGate=${actual.boundedCheckerGate.includedInRustReleaseBundle}\n\n`,
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
