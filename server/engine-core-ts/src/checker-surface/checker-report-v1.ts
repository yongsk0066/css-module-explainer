import type { WorkspaceCheckerFinding } from "../core/checker/contracts";
import {
  CHECKER_REPORT_VERSION_V1,
  type CheckerFindingRecordV1,
  type CheckerReportSummaryV1,
  type CheckerReportV1,
} from "../contracts";
import { formatCheckerFinding } from "./format-checker-finding";

export function buildCheckerReportV1(
  findings: readonly WorkspaceCheckerFinding[],
  summary: CheckerReportSummaryV1,
  workspaceRoot: string,
): CheckerReportV1 {
  return {
    version: CHECKER_REPORT_VERSION_V1,
    findings: findings.map(
      ({ filePath, finding }): CheckerFindingRecordV1 => ({
        filePath,
        category: finding.category,
        code: finding.code,
        severity: finding.severity,
        range: finding.range,
        message: formatCheckerFinding(finding, workspaceRoot),
      }),
    ),
    summary,
  };
}
