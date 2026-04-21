import type { CheckerFindingRecordV1, CheckerReportV1 } from "../../engine-core-ts/src/contracts";
import type {
  CheckerFinding,
  CheckerSeverity,
} from "../../engine-core-ts/src/core/checker/contracts";
import type {
  WorkspaceCheckCommandFilters,
  WorkspaceCheckCommandPreset,
  WorkspaceCheckResult,
} from "../../engine-host-node/src/checker-host";
import type { CheckerStyleRecoveryCanonicalProducerSignalV0 } from "./rust-style-recovery-consumer";

export type CheckerReportJsonFinding = CheckerFindingRecordV1;

export interface CheckerReportJsonV1 {
  readonly schemaVersion: "1";
  readonly reportVersion: CheckerReportV1["version"];
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
  readonly rustStyleRecoveryCanonicalProducer?: CheckerStyleRecoveryCanonicalProducerSignalV0;
}

const CHECKER_JSON_SCHEMA_VERSION = "1" as const;
const CHECKER_TOOL_NAME = "css-module-explainer/checker" as const;

export function buildCheckerJsonReport(
  result: WorkspaceCheckResult,
  report: CheckerReportV1,
  workspaceRoot: string,
  filters: WorkspaceCheckCommandFilters,
  rustStyleRecoveryCanonicalProducer?: CheckerStyleRecoveryCanonicalProducerSignalV0,
): CheckerReportJsonV1 {
  return {
    schemaVersion: CHECKER_JSON_SCHEMA_VERSION,
    reportVersion: report.version,
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
    summary: report.summary,
    findings: report.findings,
    ...(rustStyleRecoveryCanonicalProducer ? { rustStyleRecoveryCanonicalProducer } : {}),
  };
}
