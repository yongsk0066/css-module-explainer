import type { TextRewritePlan } from "../core/rewrite/text-rewrite-plan";
import type {
  EngineWorkspaceV1,
  QueryResultV1,
  SourceAnalysisInputV1,
  StyleAnalysisInputV1,
} from "./engine-v1";
import type { CheckerReportV1 } from "./checker-v1";

export const ENGINE_CONTRACT_VERSION_V2 = "2" as const;

export type StringTypeFactKindV2 = "unknown" | "exact" | "finiteSet" | "constrained" | "top";

export type StringConstraintKindV2 = "prefix" | "suffix" | "prefixSuffix";

export interface StringTypeFactsV2 {
  readonly kind: StringTypeFactKindV2;
  readonly values?: readonly string[];
  readonly constraintKind?: StringConstraintKindV2;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly minLen?: number;
  readonly maxLen?: number;
  readonly provenance?: string;
}

export interface TypeFactTableEntryV2 {
  readonly filePath: string;
  readonly expressionId: string;
  readonly facts: StringTypeFactsV2;
}

export type TypeFactTableV2 = readonly TypeFactTableEntryV2[];

export interface EngineInputV2 {
  readonly version: typeof ENGINE_CONTRACT_VERSION_V2;
  readonly workspace: EngineWorkspaceV1;
  readonly sources: readonly SourceAnalysisInputV1[];
  readonly styles: readonly StyleAnalysisInputV1[];
  readonly typeFacts: TypeFactTableV2;
}

export interface EngineOutputV2 {
  readonly version: typeof ENGINE_CONTRACT_VERSION_V2;
  readonly queryResults: readonly QueryResultV1[];
  readonly rewritePlans: readonly TextRewritePlan<unknown>[];
  readonly checkerReport: CheckerReportV1;
}
