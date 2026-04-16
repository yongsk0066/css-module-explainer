import path from "node:path";
import { formatCheckerFinding } from "./format-checker-finding";
import {
  checkWorkspace,
  type WorkspaceCheckOptions,
  type WorkspaceCheckResult,
  type WorkspaceCheckSummary,
} from "./check-workspace";
import type {
  CheckerReportJsonFinding,
  CheckerReportJsonV1,
  WorkspaceCheckerFinding,
} from "./contracts";

export type WorkspaceCheckCommandPreset = "ci" | "changed-style" | "changed-source";
export type WorkspaceCheckCommandCategory = "all" | "source" | "style";
export type WorkspaceCheckCommandSeverity = "all" | "warning" | "hint";

export interface WorkspaceCheckCommandFilters {
  readonly preset: WorkspaceCheckCommandPreset | null;
  readonly category: WorkspaceCheckCommandCategory;
  readonly severity: WorkspaceCheckCommandSeverity;
  readonly includeCodes: readonly string[];
  readonly excludeCodes: readonly string[];
}

export interface WorkspaceCheckCommandOptions {
  readonly workspace: WorkspaceCheckOptions;
  readonly filters: WorkspaceCheckCommandFilters;
}

export interface WorkspaceCheckCommandResult {
  readonly workspaceCheck: WorkspaceCheckResult;
  readonly jsonReport: CheckerReportJsonV1;
}

const CHECKER_JSON_SCHEMA_VERSION = "1" as const;
const CHECKER_TOOL_NAME = "css-module-explainer/checker" as const;

export async function runWorkspaceCheckCommand(
  options: WorkspaceCheckCommandOptions,
): Promise<WorkspaceCheckCommandResult> {
  const workspaceCheck = filterWorkspaceCheckResult(
    await checkWorkspace(options.workspace),
    options.filters,
  );

  return {
    workspaceCheck,
    jsonReport: buildCheckerJsonReport(
      workspaceCheck,
      options.workspace.workspaceRoot,
      options.filters,
    ),
  };
}

export function filterWorkspaceCheckResult(
  result: WorkspaceCheckResult,
  filters: WorkspaceCheckCommandFilters,
): WorkspaceCheckResult {
  const findings = result.findings.filter(({ finding }) => {
    if (filters.category !== "all" && finding.category !== filters.category) return false;
    if (filters.severity !== "all" && finding.severity !== filters.severity) return false;
    if (filters.includeCodes.length > 0 && !filters.includeCodes.includes(finding.code))
      return false;
    if (filters.excludeCodes.includes(finding.code)) return false;
    return true;
  });

  return {
    ...result,
    findings,
    summary: summarizeFilteredFindings(findings),
  };
}

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

function summarizeFilteredFindings(
  findings: readonly WorkspaceCheckerFinding[],
): WorkspaceCheckSummary {
  let warnings = 0;
  let hints = 0;
  for (const { finding } of findings) {
    if (finding.severity === "warning") warnings += 1;
    if (finding.severity === "hint") hints += 1;
  }
  return {
    warnings,
    hints,
    total: findings.length,
  };
}
