import { deepStrictEqual } from "node:assert";
import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  runShadowCheckerSourceMissingCanonicalCandidate,
  type CheckerSourceMissingCanonicalCandidateBundleV0,
} from "./rust-shadow-shared";

const SOURCE_MISSING_CODES = new Set([
  "missing-module",
  "missing-static-class",
  "missing-template-prefix",
  "missing-resolved-class-values",
  "missing-resolved-class-domain",
]);

const REPO_ROOT = process.cwd();
const ESLINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/eslint-plugin-smoke");

const SOURCE_MISSING_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "eslint-smoke-missing-module",
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
  },
  {
    label: "eslint-smoke-missing-static-class",
    workspace: {
      workspaceRoot: ESLINT_SMOKE_ROOT,
      sourceFilePaths: [path.join(ESLINT_SMOKE_ROOT, "src/App.jsx")],
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
  },
  {
    label: "eslint-smoke-missing-template-prefix",
    workspace: {
      workspaceRoot: ESLINT_SMOKE_ROOT,
      sourceFilePaths: [path.join(ESLINT_SMOKE_ROOT, "src/TemplatePrefix.jsx")],
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
  },
  {
    label: "eslint-smoke-missing-resolved-class-values",
    workspace: {
      workspaceRoot: ESLINT_SMOKE_ROOT,
      sourceFilePaths: [path.join(ESLINT_SMOKE_ROOT, "src/Dynamic.jsx")],
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
  },
  {
    label: "eslint-smoke-missing-resolved-class-domain",
    workspace: {
      workspaceRoot: ESLINT_SMOKE_ROOT,
      sourceFilePaths: [path.join(ESLINT_SMOKE_ROOT, "src/DynamicDomain.jsx")],
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
  },
] as const;

void (async () => {
  for (const entry of SOURCE_MISSING_CORPUS) {
    process.stdout.write(`== rust-checker-source-missing:${entry.label} ==\n`);
    // oxlint-disable-next-line no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsCheckerSourceMissingCanonicalCandidate(snapshot);
    // oxlint-disable-next-line no-await-in-loop
    const actual = await runShadowCheckerSourceMissingCanonicalCandidate(snapshot);
    deepStrictEqual(
      actual,
      expected,
      `${entry.label}: checker source-missing canonical candidate mismatch`,
    );
    process.stdout.write(
      `findings=${actual.summary.total} files=${actual.distinctFileCount} codes=${JSON.stringify(actual.codeCounts)}\n\n`,
    );
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

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
      if (finding.analysisReason) {
        result.analysisReason = finding.analysisReason;
      }
      if (finding.valueCertaintyShapeLabel) {
        result.valueCertaintyShapeLabel = finding.valueCertaintyShapeLabel;
      }
      if (finding.valueDomainDerivation) {
        result.valueDomainDerivation = finding.valueDomainDerivation;
      }
      return result;
    })
    .toSorted(compareSourceMissingFinding);

  const codeCounts = Object.fromEntries(
    [...SOURCE_MISSING_CODES]
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
    bundle: "source-missing",
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
