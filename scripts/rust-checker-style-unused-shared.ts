import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import type { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { CheckerStyleUnusedCanonicalCandidateBundleV0 } from "./rust-shadow-shared";

const STYLE_UNUSED_CODES = new Set(["unused-selector"]);

const REPO_ROOT = process.cwd();
export const STYLE_UNUSED_WORKSPACE_ROOT = path.join(
  REPO_ROOT,
  "test/_fixtures/stylelint-plugin-smoke",
);

export const STYLE_UNUSED_ENTRY: ContractParityEntry = {
  label: "stylelint-smoke-unused-selector",
  workspace: {
    workspaceRoot: STYLE_UNUSED_WORKSPACE_ROOT,
    sourceFilePaths: [path.join(STYLE_UNUSED_WORKSPACE_ROOT, "src/App.tsx")],
    styleFilePaths: [path.join(STYLE_UNUSED_WORKSPACE_ROOT, "src/App.module.css")],
  },
  filters: {
    preset: "changed-style",
    category: "style",
    severity: "all",
    includeBundles: ["style-unused"],
    includeCodes: [],
    excludeCodes: [],
  },
};

export function deriveTsCheckerStyleUnusedCanonicalCandidate(
  snapshot: Awaited<ReturnType<typeof buildContractParitySnapshot>>,
): CheckerStyleUnusedCanonicalCandidateBundleV0 {
  const findings = snapshot.output.checkerReport.findings
    .filter((finding) => finding.category === "style" && STYLE_UNUSED_CODES.has(finding.code))
    .map((finding) => {
      const result: CheckerStyleUnusedCanonicalCandidateBundleV0["findings"][number] = {
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
    .toSorted(compareStyleUnusedFinding);

  const codeCounts = Object.fromEntries(
    [...STYLE_UNUSED_CODES]
      .map((code) => [code, findings.filter((finding) => finding.code === code).length] as const)
      .filter(([, count]) => count > 0),
  );

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    reportVersion: snapshot.output.checkerReport.version,
    bundle: "style-unused",
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

function compareStyleUnusedFinding(
  left: CheckerStyleUnusedCanonicalCandidateBundleV0["findings"][number],
  right: CheckerStyleUnusedCanonicalCandidateBundleV0["findings"][number],
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
