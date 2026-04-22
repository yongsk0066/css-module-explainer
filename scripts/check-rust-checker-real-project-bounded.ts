import { deepStrictEqual, strict as assert } from "node:assert";
import path from "node:path";
import { runCheckerCli } from "../server/checker-cli/src";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  runShadowCheckerSourceMissingCanonicalCandidate,
  runShadowCheckerSourceMissingCanonicalProducer,
  runShadowCheckerStyleRecoveryCanonicalCandidate,
  runShadowCheckerStyleRecoveryCanonicalProducer,
  type CheckerSourceMissingCanonicalCandidateBundleV0,
  type CheckerSourceMissingCanonicalProducerSignalV0,
  type CheckerStyleRecoveryCanonicalCandidateBundleV0,
  type CheckerStyleRecoveryCanonicalProducerSignalV0,
} from "./rust-shadow-shared";

const STYLE_RECOVERY_CODES = new Set([
  "missing-composed-module",
  "missing-composed-selector",
  "missing-value-module",
  "missing-imported-value",
  "missing-keyframes",
]);

const SOURCE_MISSING_CODES = new Set([
  "missing-module",
  "missing-static-class",
  "missing-template-prefix",
  "missing-resolved-class-values",
  "missing-resolved-class-domain",
]);

const REPO_ROOT = process.cwd();
const WORKSPACE_ROOT = path.join(REPO_ROOT, "test/_fixtures/real-project-checker-corpus");

const STYLE_RECOVERY_ENTRY: ContractParityEntry = {
  label: "real-project-dashboard-card",
  workspace: {
    workspaceRoot: WORKSPACE_ROOT,
    sourceFilePaths: [path.join(WORKSPACE_ROOT, "DashboardCard.tsx")],
    styleFilePaths: [
      path.join(WORKSPACE_ROOT, "DashboardCard.module.scss"),
      path.join(WORKSPACE_ROOT, "DashboardCardBase.module.scss"),
    ],
  },
  filters: {
    preset: "ci",
    category: "style",
    severity: "all",
    includeBundles: ["style-recovery"],
    includeCodes: [],
    excludeCodes: [],
  },
};

const SOURCE_MISSING_ENTRY: ContractParityEntry = {
  label: "real-project-nav-pill",
  workspace: {
    workspaceRoot: WORKSPACE_ROOT,
    sourceFilePaths: [path.join(WORKSPACE_ROOT, "NavPill.tsx")],
    styleFilePaths: [path.join(WORKSPACE_ROOT, "NavPill.module.scss")],
  },
  filters: {
    preset: "ci",
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

  const expectedStyleCandidate = deriveTsCheckerStyleRecoveryCanonicalCandidate(styleSnapshot);
  const actualStyleCandidate = await runShadowCheckerStyleRecoveryCanonicalCandidate(styleSnapshot);
  deepStrictEqual(
    actualStyleCandidate,
    expectedStyleCandidate,
    "real-project-dashboard-card: checker style-recovery canonical candidate mismatch",
  );
  assert.equal(actualStyleCandidate.summary.total, 1);
  assert.equal(actualStyleCandidate.findings[0]?.code, "missing-composed-selector");

  const expectedSourceCandidate = deriveTsCheckerSourceMissingCanonicalCandidate(sourceSnapshot);
  const actualSourceCandidate =
    await runShadowCheckerSourceMissingCanonicalCandidate(sourceSnapshot);
  deepStrictEqual(
    actualSourceCandidate,
    expectedSourceCandidate,
    "real-project-nav-pill: checker source-missing canonical candidate mismatch",
  );
  assert.equal(actualSourceCandidate.summary.total, 1);
  assert.equal(actualSourceCandidate.findings[0]?.code, "missing-static-class");

  const actualStyleProducer = await runShadowCheckerStyleRecoveryCanonicalProducer(styleSnapshot);
  deepStrictEqual(actualStyleProducer, {
    schemaVersion: "0",
    inputVersion: expectedStyleCandidate.inputVersion,
    canonicalCandidate: expectedStyleCandidate,
    boundedCheckerGate: {
      canonicalCandidateCommand: "pnpm check:rust-checker-style-recovery-canonical-candidate",
      canonicalProducerCommand: "pnpm check:rust-checker-style-recovery-canonical-producer",
      consumerBoundaryCommand: "pnpm check:rust-checker-style-recovery-consumer-boundary",
      boundedCheckerLaneCommand: "pnpm check:rust-checker-bounded-lanes",
      promotionReviewCommand: "pnpm check:rust-checker-promotion-review",
      broaderRustLaneCommand: "pnpm check:rust-lane-bundle",
      minimumBoundedLaneCountForRustLaneBundle: 2,
      checkerBundle: "style-recovery",
      includedInRustLaneBundle: false,
      includedInRustReleaseBundle: false,
    },
  } satisfies CheckerStyleRecoveryCanonicalProducerSignalV0);

  const actualSourceProducer = await runShadowCheckerSourceMissingCanonicalProducer(sourceSnapshot);
  deepStrictEqual(actualSourceProducer, {
    schemaVersion: "0",
    inputVersion: expectedSourceCandidate.inputVersion,
    canonicalCandidate: expectedSourceCandidate,
    boundedCheckerGate: {
      canonicalCandidateCommand: "pnpm check:rust-checker-source-missing-canonical-candidate",
      canonicalProducerCommand: "pnpm check:rust-checker-source-missing-canonical-producer",
      consumerBoundaryCommand: "pnpm check:rust-checker-source-missing-consumer-boundary",
      boundedCheckerLaneCommand: "pnpm check:rust-checker-bounded-lanes",
      promotionReviewCommand: "pnpm check:rust-checker-promotion-review",
      broaderRustLaneCommand: "pnpm check:rust-lane-bundle",
      minimumBoundedLaneCountForRustLaneBundle: 2,
      checkerBundle: "source-missing",
      includedInRustLaneBundle: false,
      includedInRustReleaseBundle: false,
    },
  } satisfies CheckerSourceMissingCanonicalProducerSignalV0);

  const styleConsumerPayload = await runRustConsumerCheck({
    cwd: WORKSPACE_ROOT,
    sourceFiles: ["DashboardCard.tsx"],
    styleFiles: ["DashboardCard.module.scss", "DashboardCardBase.module.scss"],
    includeBundle: "style-recovery",
    flag: "--rust-style-recovery-consumer",
  });
  assert.equal(styleConsumerPayload.summary.total, 1);
  assert.equal(styleConsumerPayload.findings[0]?.code, "missing-composed-selector");
  assert.equal(styleConsumerPayload.rustStyleRecoveryConsistency.findingsMatch, true);
  assert.equal(styleConsumerPayload.rustStyleRecoveryConsistency.countsMatch, true);

  const sourceConsumerPayload = await runRustConsumerCheck({
    cwd: WORKSPACE_ROOT,
    sourceFiles: ["NavPill.tsx"],
    styleFiles: ["NavPill.module.scss"],
    includeBundle: "source-missing",
    flag: "--rust-source-missing-consumer",
  });
  assert.equal(sourceConsumerPayload.summary.total, 1);
  assert.equal(sourceConsumerPayload.findings[0]?.code, "missing-static-class");
  assert.equal(sourceConsumerPayload.rustSourceMissingConsistency.findingsMatch, true);
  assert.equal(sourceConsumerPayload.rustSourceMissingConsistency.countsMatch, true);

  process.stdout.write(
    [
      "== rust-checker-real-project-bounded:style-recovery ==",
      `label=${STYLE_RECOVERY_ENTRY.label}`,
      `findings=${actualStyleCandidate.summary.total}`,
      `code=${actualStyleCandidate.findings[0]?.code}`,
      "consistent=true",
      "",
    ].join("\n"),
  );
  process.stdout.write(
    [
      "== rust-checker-real-project-bounded:source-missing ==",
      `label=${SOURCE_MISSING_ENTRY.label}`,
      `findings=${actualSourceCandidate.summary.total}`,
      `code=${actualSourceCandidate.findings[0]?.code}`,
      "consistent=true",
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

function deriveTsCheckerStyleRecoveryCanonicalCandidate(
  snapshot: Awaited<ReturnType<typeof buildContractParitySnapshot>>,
): CheckerStyleRecoveryCanonicalCandidateBundleV0 {
  const findings = snapshot.output.checkerReport.findings
    .filter((finding) => finding.category === "style" && STYLE_RECOVERY_CODES.has(finding.code))
    .map((finding) => {
      const result: CheckerStyleRecoveryCanonicalCandidateBundleV0["findings"][number] = {
        filePath: finding.filePath,
        code: finding.code,
        severity: finding.severity,
        range: finding.range,
        message: finding.message,
      };
      if (finding.analysisReason) result.analysisReason = finding.analysisReason;
      if (finding.valueCertaintyShapeLabel) {
        result.valueCertaintyShapeLabel = finding.valueCertaintyShapeLabel;
      }
      return result;
    })
    .toSorted(compareStyleRecoveryFinding);

  const codeCounts = Object.fromEntries(
    [...STYLE_RECOVERY_CODES]
      .map((code) => [code, findings.filter((finding) => finding.code === code).length] as const)
      .filter(([, count]) => count > 0),
  );

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    reportVersion: snapshot.output.checkerReport.version,
    bundle: "style-recovery",
    distinctFileCount: new Set(findings.map((finding) => finding.filePath)).size,
    codeCounts,
    summary: {
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      hints: findings.filter((finding) => finding.severity === "hint").length,
      total: findings.length,
    },
    findings,
  };
}

function deriveTsCheckerSourceMissingCanonicalCandidate(
  snapshot: Awaited<ReturnType<typeof buildContractParitySnapshot>>,
): CheckerSourceMissingCanonicalCandidateBundleV0 {
  const findings = snapshot.output.checkerReport.findings
    .filter((finding) => finding.category === "source" && SOURCE_MISSING_CODES.has(finding.code))
    .map((finding) => {
      const result: CheckerSourceMissingCanonicalCandidateBundleV0["findings"][number] = {
        filePath: finding.filePath,
        code: finding.code,
        severity: finding.severity,
        range: finding.range,
        message: finding.message,
      };
      if (finding.analysisReason) result.analysisReason = finding.analysisReason;
      if (finding.valueCertaintyShapeLabel) {
        result.valueCertaintyShapeLabel = finding.valueCertaintyShapeLabel;
      }
      return result;
    })
    .toSorted(compareSourceMissingFinding);

  const codeCounts = Object.fromEntries(
    [...SOURCE_MISSING_CODES]
      .map((code) => [code, findings.filter((finding) => finding.code === code).length] as const)
      .filter(([, count]) => count > 0),
  );

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    reportVersion: snapshot.output.checkerReport.version,
    bundle: "source-missing",
    distinctFileCount: new Set(findings.map((finding) => finding.filePath)).size,
    codeCounts,
    summary: {
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      hints: findings.filter((finding) => finding.severity === "hint").length,
      total: findings.length,
    },
    findings,
  };
}

function compareStyleRecoveryFinding(
  left: CheckerStyleRecoveryCanonicalCandidateBundleV0["findings"][number],
  right: CheckerStyleRecoveryCanonicalCandidateBundleV0["findings"][number],
): number {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.code.localeCompare(right.code) ||
    left.severity.localeCompare(right.severity) ||
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character ||
    left.range.end.line - right.range.end.line ||
    left.range.end.character - right.range.end.character ||
    left.message.localeCompare(right.message) ||
    (left.analysisReason ?? "").localeCompare(right.analysisReason ?? "") ||
    (left.valueCertaintyShapeLabel ?? "").localeCompare(right.valueCertaintyShapeLabel ?? "")
  );
}

function compareSourceMissingFinding(
  left: CheckerSourceMissingCanonicalCandidateBundleV0["findings"][number],
  right: CheckerSourceMissingCanonicalCandidateBundleV0["findings"][number],
): number {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.code.localeCompare(right.code) ||
    left.severity.localeCompare(right.severity) ||
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character ||
    left.range.end.line - right.range.end.line ||
    left.range.end.character - right.range.end.character ||
    left.message.localeCompare(right.message) ||
    (left.analysisReason ?? "").localeCompare(right.analysisReason ?? "") ||
    (left.valueCertaintyShapeLabel ?? "").localeCompare(right.valueCertaintyShapeLabel ?? "")
  );
}

async function runRustConsumerCheck(input: {
  readonly cwd: string;
  readonly sourceFiles: readonly string[];
  readonly styleFiles: readonly string[];
  readonly includeBundle: "style-recovery" | "source-missing";
  readonly flag: "--rust-style-recovery-consumer" | "--rust-source-missing-consumer";
}): Promise<any> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const args = [
    input.cwd,
    "--preset",
    "ci",
    ...input.sourceFiles.flatMap((file) => ["--source-file", file]),
    ...input.styleFiles.flatMap((file) => ["--style-file", file]),
    "--include-bundle",
    input.includeBundle,
    "--format",
    "json",
    "--fail-on",
    "none",
    input.flag,
  ];

  const exitCode = await runCheckerCli(args, {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
    cwd: () => input.cwd,
  });

  assert.equal(exitCode, 0, `${input.includeBundle}: expected zero exit`);
  assert.equal(stderr.join(""), "", `${input.includeBundle}: unexpected stderr`);
  return JSON.parse(stdout.join(""));
}
