import path from "node:path";
import { formatCheckerFinding } from "../checker-surface";
import type { CheckerFinding, CheckerSeverity } from "../core/checker/contracts";
import type {
  WorkspaceCheckCommandFilters,
  WorkspaceCheckCommandPreset,
  WorkspaceCheckResult,
} from "../checker-host";

export interface CheckerReportJsonFinding {
  readonly filePath: string;
  readonly category: CheckerFinding["category"];
  readonly code: CheckerFinding["code"];
  readonly severity: CheckerFinding["severity"];
  readonly range: CheckerFinding["range"];
  readonly message: string;
}

export interface CheckerReportJsonV1 {
  readonly schemaVersion: "1";
  readonly tool: "css-module-explainer/checker";
  readonly workspaceRoot: string;
  readonly filters: {
    readonly preset: WorkspaceCheckCommandPreset | null;
    readonly category: CheckerFinding["category"] | "all";
    readonly severity: CheckerSeverity | "all";
    readonly includeBundles: readonly string[];
    readonly includeCodes: readonly string[];
    readonly excludeCodes: readonly string[];
  };
  readonly sourceFiles: readonly string[];
  readonly styleFiles: readonly string[];
  readonly summary: {
    readonly warnings: number;
    readonly hints: number;
    readonly total: number;
  };
  readonly findings: readonly CheckerReportJsonFinding[];
}

const CHECKER_JSON_SCHEMA_VERSION = "1" as const;
const CHECKER_TOOL_NAME = "css-module-explainer/checker" as const;

export function buildCheckerJsonReport(
  result: WorkspaceCheckResult,
  workspaceRoot: string,
  filters: WorkspaceCheckCommandFilters,
): CheckerReportJsonV1 {
  return {
    schemaVersion: CHECKER_JSON_SCHEMA_VERSION,
    tool: CHECKER_TOOL_NAME,
    workspaceRoot,
    filters: {
      preset: filters.preset,
      category: filters.category,
      severity: filters.severity,
      includeBundles: filters.includeBundles,
      includeCodes: filters.includeCodes,
      excludeCodes: filters.excludeCodes,
    },
    sourceFiles: result.sourceFiles,
    styleFiles: result.styleFiles,
    summary: result.summary,
    findings: result.findings.map(
      ({ filePath, finding }): CheckerReportJsonFinding => ({
        filePath,
        category: finding.category,
        code: finding.code,
        severity: finding.severity,
        range: finding.range,
        message: formatCheckerFinding(finding, path.dirname(filePath)),
      }),
    ),
  };
}
