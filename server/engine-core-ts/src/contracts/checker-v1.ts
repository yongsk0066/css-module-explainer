import type { Range } from "@css-module-explainer/shared";
import type { CheckerFinding } from "../core/checker/contracts";

export const CHECKER_REPORT_VERSION_V1 = "1" as const;

export interface CheckerFindingRecordV1 {
  readonly filePath: string;
  readonly category: CheckerFinding["category"];
  readonly code: CheckerFinding["code"];
  readonly severity: CheckerFinding["severity"];
  readonly range: Range;
  readonly message: string;
  readonly analysisReason?: string;
  readonly valueCertaintyShapeLabel?: string;
}

export interface CheckerReportSummaryV1 {
  readonly warnings: number;
  readonly hints: number;
  readonly total: number;
}

export interface CheckerReportV1 {
  readonly version: typeof CHECKER_REPORT_VERSION_V1;
  readonly findings: readonly CheckerFindingRecordV1[];
  readonly summary: CheckerReportSummaryV1;
}
