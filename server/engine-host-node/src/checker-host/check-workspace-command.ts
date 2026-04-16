import {
  checkWorkspace,
  type WorkspaceCheckOptions,
  type WorkspaceCheckResult,
  type WorkspaceCheckSummary,
} from "./check-workspace";
import type { CheckerCodeBundle } from "../../../engine-core-ts/src/core/checker/checker-code-bundles";
import type { WorkspaceCheckerFinding } from "../../../engine-core-ts/src/core/checker/contracts";
import type { CheckerReportV1 } from "../../../engine-core-ts/src/contracts";
import { buildCheckerReportV1 } from "../../../engine-core-ts/src/checker-surface";

export type WorkspaceCheckCommandPreset = "ci" | "changed-style" | "changed-source";
export type WorkspaceCheckCommandCategory = "all" | "source" | "style";
export type WorkspaceCheckCommandSeverity = "all" | "warning" | "hint";

export interface WorkspaceCheckCommandFilters {
  readonly preset: WorkspaceCheckCommandPreset | null;
  readonly category: WorkspaceCheckCommandCategory;
  readonly severity: WorkspaceCheckCommandSeverity;
  readonly includeBundles: readonly CheckerCodeBundle[];
  readonly includeCodes: readonly string[];
  readonly excludeCodes: readonly string[];
}

export interface WorkspaceCheckCommandOptions {
  readonly workspace: WorkspaceCheckOptions;
  readonly filters: WorkspaceCheckCommandFilters;
}

export interface WorkspaceCheckCommandResult {
  readonly workspaceCheck: WorkspaceCheckResult;
  readonly checkerReport: CheckerReportV1;
}

export async function runWorkspaceCheckCommand(
  options: WorkspaceCheckCommandOptions,
): Promise<WorkspaceCheckCommandResult> {
  const workspaceCheck = filterWorkspaceCheckResult(
    await checkWorkspace(options.workspace),
    options.filters,
  );
  return {
    workspaceCheck,
    checkerReport: buildCheckerReportV1(
      workspaceCheck.findings,
      workspaceCheck.summary,
      options.workspace.workspaceRoot,
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
