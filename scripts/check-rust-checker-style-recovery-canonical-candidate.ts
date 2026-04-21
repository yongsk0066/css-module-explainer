import { deepStrictEqual } from "node:assert";
import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  runShadowCheckerStyleRecoveryCanonicalCandidate,
  type CheckerStyleRecoveryCanonicalCandidateBundleV0,
} from "./rust-shadow-shared";

const STYLE_RECOVERY_CODES = new Set([
  "missing-composed-module",
  "missing-composed-selector",
  "missing-value-module",
  "missing-imported-value",
  "missing-keyframes",
]);

const REPO_ROOT = process.cwd();
const STYLELINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/stylelint-plugin-smoke");

const STYLE_RECOVERY_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "stylelint-smoke-composes-missing-module",
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
  },
  {
    label: "stylelint-smoke-composes-missing-selector",
    workspace: {
      workspaceRoot: STYLELINT_SMOKE_ROOT,
      sourceFilePaths: [],
      styleFilePaths: [path.join(STYLELINT_SMOKE_ROOT, "src/ComposesMissingSelector.module.css")],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "stylelint-smoke-value-missing-module",
    workspace: {
      workspaceRoot: STYLELINT_SMOKE_ROOT,
      sourceFilePaths: [],
      styleFilePaths: [path.join(STYLELINT_SMOKE_ROOT, "src/ValueMissingModule.module.css")],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "stylelint-smoke-value-missing-imported",
    workspace: {
      workspaceRoot: STYLELINT_SMOKE_ROOT,
      sourceFilePaths: [],
      styleFilePaths: [path.join(STYLELINT_SMOKE_ROOT, "src/ValueMissingImported.module.css")],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "stylelint-smoke-keyframes-missing",
    workspace: {
      workspaceRoot: STYLELINT_SMOKE_ROOT,
      sourceFilePaths: [],
      styleFilePaths: [path.join(STYLELINT_SMOKE_ROOT, "src/KeyframesMissing.module.css")],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
] as const;

void (async () => {
  for (const entry of STYLE_RECOVERY_CORPUS) {
    process.stdout.write(`== rust-checker-style-recovery:${entry.label} ==\n`);
    // oxlint-disable-next-line no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsCheckerStyleRecoveryCanonicalCandidate(snapshot);
    // oxlint-disable-next-line no-await-in-loop
    const actual = await runShadowCheckerStyleRecoveryCanonicalCandidate(snapshot);
    deepStrictEqual(
      actual,
      expected,
      `${entry.label}: checker style-recovery canonical candidate mismatch`,
    );
    process.stdout.write(
      `findings=${actual.summary.total} files=${actual.distinctFileCount} codes=${JSON.stringify(actual.codeCounts)}\n\n`,
    );
  }
})();

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
      if (finding.analysisReason) {
        result.analysisReason = finding.analysisReason;
      }
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

  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const hintCount = findings.filter((finding) => finding.severity === "hint").length;
  const distinctFileCount = new Set(findings.map((finding) => finding.filePath)).size;

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    reportVersion: snapshot.output.checkerReport.version,
    bundle: "style-recovery",
    distinctFileCount,
    codeCounts,
    summary: {
      warnings: warningCount,
      hints: hintCount,
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
