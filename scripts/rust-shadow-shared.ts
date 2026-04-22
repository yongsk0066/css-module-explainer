import { spawn } from "node:child_process";
import path from "node:path";
import type { EngineParitySnapshotV2 } from "../server/engine-host-node/src/engine-parity-v2";
import type { EngineInputV2, QueryResultV2 } from "../server/engine-core-ts/src/contracts";

const REPO_ROOT = process.cwd();
const RUST_MANIFEST = path.join(REPO_ROOT, "rust/Cargo.toml");

export interface ShadowSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly sourceCount: number;
  readonly styleCount: number;
  readonly typeFactCount: number;
  readonly distinctFactFiles: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly constrainedKinds: Readonly<Record<string, number>>;
  readonly finiteValueCount: number;
  readonly queryResultCount: number;
  readonly queryKindCounts: Readonly<Record<string, number>>;
  readonly expressionValueDomainKinds: Readonly<Record<string, number>>;
  readonly expressionValueConstraintKinds: Readonly<Record<string, number>>;
  readonly expressionConstraintDetailCounts: ConstraintDetailCounts;
  readonly expressionValueCertaintyShapes: Readonly<Record<string, number>>;
  readonly expressionSelectorCertaintyShapes: Readonly<Record<string, number>>;
  readonly resolutionValueConstraintKinds: Readonly<Record<string, number>>;
  readonly resolutionConstraintDetailCounts: ConstraintDetailCounts;
  readonly resolutionValueCertaintyShapes: Readonly<Record<string, number>>;
  readonly resolutionSelectorCertaintyShapes: Readonly<Record<string, number>>;
  readonly selectorUsageReferencedCount: number;
  readonly selectorUsageUnreferencedCount: number;
  readonly selectorUsageTotalReferences: number;
  readonly selectorUsageDirectReferences: number;
  readonly selectorUsageEditableDirectReferences: number;
  readonly selectorUsageExactReferences: number;
  readonly selectorUsageInferredOrBetterReferences: number;
  readonly selectorUsageExpandedCount: number;
  readonly selectorUsageStyleDependencyCount: number;
  readonly expectedExpressionSemanticsCount: number;
  readonly expectedSourceExpressionResolutionCount: number;
  readonly expectedSelectorUsageCount: number;
  readonly expectedTotalQueryCount: number;
  readonly matchedExpressionQueryPairs: number;
  readonly missingExpressionSemanticsCount: number;
  readonly missingSourceExpressionResolutionCount: number;
  readonly unexpectedExpressionSemanticsCount: number;
  readonly unexpectedSourceExpressionResolutionCount: number;
  readonly matchedSelectorUsageCount: number;
  readonly missingSelectorUsageCount: number;
  readonly unexpectedSelectorUsageCount: number;
  readonly rewritePlanCount: number;
  readonly checkerWarningCount: number;
  readonly checkerHintCount: number;
  readonly checkerTotalFindings: number;
}

export interface TypeFactInputSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly typeFactCount: number;
  readonly distinctFactFiles: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly constrainedKinds: Readonly<Record<string, number>>;
  readonly finiteValueCount: number;
}

export interface QueryPlanSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly expressionSemanticsIds: readonly string[];
  readonly sourceExpressionResolutionIds: readonly string[];
  readonly selectorUsageIds: readonly string[];
  readonly totalQueryCount: number;
}

export interface ExpressionDomainPlanSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly plannedExpressionIds: readonly string[];
  readonly valueDomainKinds: Readonly<Record<string, number>>;
  readonly valueConstraintKinds: Readonly<Record<string, number>>;
  readonly constraintDetailCounts: ConstraintDetailCounts;
  readonly finiteValueCount: number;
}

export interface ExpressionDomainFragmentV0 {
  readonly expressionId: string;
  readonly filePath: string;
  readonly valueDomainKind: string;
  readonly valueConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
  readonly finiteValueCount: number;
}

export interface ExpressionDomainFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly ExpressionDomainFragmentV0[];
}

export interface ExpressionDomainCandidateV0 {
  readonly expressionId: string;
  readonly filePath: string;
  readonly valueDomainKind: string;
  readonly valueConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
  readonly finiteValueCount: number;
}

export interface ExpressionDomainCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly candidates: readonly ExpressionDomainCandidateV0[];
}

export interface ExpressionDomainCanonicalCandidateBundleV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly planSummary: ExpressionDomainPlanSummaryV0;
  readonly fragments: readonly ExpressionDomainFragmentV0[];
  readonly candidates: readonly ExpressionDomainCandidateV0[];
}

export interface ExpressionDomainEvaluatorCandidatePayloadV0 {
  readonly expressionId: string;
  readonly valueDomainKind: string;
  readonly valueConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
  readonly finiteValueCount: number;
}

export interface ExpressionDomainEvaluatorCandidateV0 {
  readonly kind: string;
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: ExpressionDomainEvaluatorCandidatePayloadV0;
}

export interface ExpressionDomainEvaluatorCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly results: readonly ExpressionDomainEvaluatorCandidateV0[];
}

export interface ExpressionDomainCanonicalProducerSignalV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalBundle: ExpressionDomainCanonicalCandidateBundleV0;
  readonly evaluatorCandidates: ExpressionDomainEvaluatorCandidatesV0;
}

export interface SelectorUsagePlanSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalSelectorNames: readonly string[];
  readonly viewKindCounts: Readonly<Record<string, number>>;
  readonly nestedSafetyCounts: Readonly<Record<string, number>>;
  readonly composedSelectorCount: number;
  readonly totalComposesRefs: number;
}

export interface SelectorUsageFragmentV0 {
  readonly ordinal: number;
  readonly viewKind: string;
  readonly canonicalName?: string;
  readonly nestedSafety?: string;
  readonly composesCount: number;
}

export interface SelectorUsageFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly SelectorUsageFragmentV0[];
}

export interface SelectorUsageQueryFragmentV0 {
  readonly queryId: string;
  readonly canonicalName: string;
  readonly nestedSafety?: string;
  readonly composesCount: number;
}

export interface SelectorUsageQueryFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly SelectorUsageQueryFragmentV0[];
}

export interface SourceResolutionPlanSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly plannedExpressionIds: readonly string[];
  readonly expressionKindCounts: Readonly<Record<string, number>>;
  readonly distinctStyleFilePaths: readonly string[];
  readonly symbolRefWithBindingCount: number;
  readonly styleAccessCount: number;
  readonly styleAccessPathDepthSum: number;
}

export interface SourceResolutionQueryFragmentV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly expressionKind: string;
  readonly styleFilePath: string;
}

export interface SourceResolutionQueryFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly SourceResolutionQueryFragmentV0[];
}

export interface SourceResolutionMatchFragmentV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly finiteValues?: readonly string[];
}

export interface SourceResolutionMatchFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly SourceResolutionMatchFragmentV0[];
}

export interface SourceResolutionCandidateV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly finiteValues?: readonly string[];
  readonly selectorCertainty: string;
  readonly valueCertainty?: string;
  readonly selectorCertaintyShapeKind: string;
  readonly selectorCertaintyShapeLabel: string;
  readonly selectorConstraintKind?: string;
  readonly valueCertaintyShapeKind: string;
  readonly valueCertaintyShapeLabel: string;
  readonly valueCertaintyConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
}

export interface SourceResolutionCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly candidates: readonly SourceResolutionCandidateV0[];
}

export interface SourceResolutionCanonicalCandidateBundleV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly queryFragments: readonly SourceResolutionQueryFragmentV0[];
  readonly fragments: readonly SourceResolutionFragmentV0[];
  readonly matchFragments: readonly SourceResolutionMatchFragmentV0[];
  readonly candidates: readonly SourceResolutionCandidateV0[];
}

export interface SourceResolutionEvaluatorCandidatePayloadV0 {
  readonly expressionId: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly finiteValues?: readonly string[];
  readonly selectorCertainty: string;
  readonly valueCertainty?: string;
  readonly selectorCertaintyShapeKind: string;
  readonly selectorCertaintyShapeLabel: string;
  readonly valueCertaintyShapeKind: string;
  readonly valueCertaintyShapeLabel: string;
  readonly selectorConstraintKind?: string;
  readonly valueCertaintyConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
}

export interface SourceResolutionEvaluatorCandidateV0 {
  readonly kind: "source-expression-resolution";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: SourceResolutionEvaluatorCandidatePayloadV0;
}

export interface SourceResolutionEvaluatorCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly results: readonly SourceResolutionEvaluatorCandidateV0[];
}

export interface SourceResolutionCanonicalProducerSignalV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalBundle: SourceResolutionCanonicalCandidateBundleV0;
  readonly evaluatorCandidates: SourceResolutionEvaluatorCandidatesV0;
}

export interface SourceSideCanonicalCandidateBundleV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly expressionSemantics: ExpressionSemanticsCanonicalCandidateBundleV0;
  readonly sourceResolution: SourceResolutionCanonicalCandidateBundleV0;
}

export interface SourceSideEvaluatorCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly expressionSemantics: ExpressionSemanticsEvaluatorCandidatesV0;
  readonly sourceResolution: SourceResolutionEvaluatorCandidatesV0;
}

export interface SourceSideCanonicalProducerSignalV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalBundle: SourceSideCanonicalCandidateBundleV0;
  readonly evaluatorCandidates: SourceSideEvaluatorCandidatesV0;
}

export interface SemanticCanonicalCandidateBundleV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly sourceSide: SourceSideCanonicalCandidateBundleV0;
  readonly expressionDomain: ExpressionDomainCanonicalCandidateBundleV0;
}

export interface SemanticEvaluatorCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly sourceSide: SourceSideEvaluatorCandidatesV0;
  readonly expressionDomain: ExpressionDomainEvaluatorCandidatesV0;
}

export interface SemanticCanonicalProducerSignalV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalBundle: SemanticCanonicalCandidateBundleV0;
  readonly evaluatorCandidates: SemanticEvaluatorCandidatesV0;
}

export interface ExpressionSemanticsFragmentV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly expressionKind: string;
  readonly styleFilePath: string;
  readonly valueDomainKind: string;
  readonly valueConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
}

export interface ExpressionSemanticsFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly ExpressionSemanticsFragmentV0[];
}

export interface ExpressionSemanticsQueryFragmentV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly expressionKind: string;
  readonly styleFilePath: string;
}

export interface ExpressionSemanticsQueryFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly ExpressionSemanticsQueryFragmentV0[];
}

export interface ExpressionSemanticsMatchFragmentV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly candidateNames: readonly string[];
  readonly finiteValues?: readonly string[];
}

export interface ExpressionSemanticsMatchFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly ExpressionSemanticsMatchFragmentV0[];
}

export interface ExpressionSemanticsCandidateV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly expressionKind: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly candidateNames: readonly string[];
  readonly finiteValues?: readonly string[];
  readonly valueDomainKind: string;
  readonly selectorCertainty: string;
  readonly valueCertainty?: string;
  readonly selectorCertaintyShapeKind: string;
  readonly selectorCertaintyShapeLabel: string;
  readonly valueCertaintyShapeKind: string;
  readonly valueCertaintyShapeLabel: string;
  readonly selectorConstraintKind?: string;
  readonly valueCertaintyConstraintKind?: string;
  readonly valueConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
}

export interface ExpressionSemanticsCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly candidates: readonly ExpressionSemanticsCandidateV0[];
}

export interface ExpressionSemanticsCanonicalCandidateBundleV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly queryFragments: readonly ExpressionSemanticsQueryFragmentV0[];
  readonly fragments: readonly ExpressionSemanticsFragmentV0[];
  readonly matchFragments: readonly ExpressionSemanticsMatchFragmentV0[];
  readonly candidates: readonly ExpressionSemanticsCandidateV0[];
}

export interface ExpressionSemanticsEvaluatorCandidatePayloadV0 {
  readonly expressionId: string;
  readonly expressionKind: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly candidateNames: readonly string[];
  readonly finiteValues?: readonly string[];
  readonly valueDomainKind: string;
  readonly selectorCertainty: string;
  readonly valueCertainty?: string;
  readonly selectorCertaintyShapeKind: string;
  readonly selectorCertaintyShapeLabel: string;
  readonly valueCertaintyShapeKind: string;
  readonly valueCertaintyShapeLabel: string;
  readonly selectorConstraintKind?: string;
  readonly valueCertaintyConstraintKind?: string;
  readonly valueConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
}

export interface ExpressionSemanticsEvaluatorCandidateV0 {
  readonly kind: "expression-semantics";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: ExpressionSemanticsEvaluatorCandidatePayloadV0;
}

export interface ExpressionSemanticsEvaluatorCandidatesV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly results: readonly ExpressionSemanticsEvaluatorCandidateV0[];
}

export interface ExpressionSemanticsCanonicalProducerSignalV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalBundle: ExpressionSemanticsCanonicalCandidateBundleV0;
  readonly evaluatorCandidates: ExpressionSemanticsEvaluatorCandidatesV0;
}

export interface SourceResolutionFragmentV0 {
  readonly queryId: string;
  readonly expressionId: string;
  readonly styleFilePath: string;
  readonly valueCertaintyShapeKind: string;
  readonly valueCertaintyConstraintKind?: string;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
  readonly valueMinLen?: number;
  readonly valueMaxLen?: number;
  readonly valueCharMust?: string;
  readonly valueCharMay?: string;
  readonly valueMayIncludeOtherChars?: boolean;
}

export interface SourceResolutionFragmentsV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly fragments: readonly SourceResolutionFragmentV0[];
}

export interface CheckerStyleRecoveryFindingV0 {
  readonly filePath: string;
  readonly code: string;
  readonly severity: string;
  readonly range: {
    readonly start: {
      readonly line: number;
      readonly character: number;
    };
    readonly end: {
      readonly line: number;
      readonly character: number;
    };
  };
  readonly message: string;
  readonly analysisReason?: string;
  readonly valueCertaintyShapeLabel?: string;
}

export interface CheckerStyleRecoveryCanonicalCandidateBundleV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly reportVersion: string;
  readonly bundle: "style-recovery";
  readonly distinctFileCount: number;
  readonly codeCounts: Readonly<Record<string, number>>;
  readonly summary: {
    readonly warnings: number;
    readonly hints: number;
    readonly total: number;
  };
  readonly findings: readonly CheckerStyleRecoveryFindingV0[];
}

export interface CheckerStyleRecoveryCanonicalProducerSignalV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalCandidate: CheckerStyleRecoveryCanonicalCandidateBundleV0;
  readonly boundedCheckerGate: {
    readonly canonicalCandidateCommand: "pnpm check:rust-checker-style-recovery-canonical-candidate";
    readonly canonicalProducerCommand: "pnpm check:rust-checker-style-recovery-canonical-producer";
    readonly consumerBoundaryCommand: "pnpm check:rust-checker-style-recovery-consumer-boundary";
    readonly boundedCheckerLaneCommand: "pnpm check:rust-checker-bounded-lanes";
    readonly promotionReviewCommand: "pnpm check:rust-checker-promotion-review";
    readonly promotionEvidenceCommand: "pnpm check:rust-checker-promotion-evidence";
    readonly broaderRustLaneCommand: "pnpm check:rust-lane-bundle";
    readonly releaseGateReadinessCommand: "pnpm check:rust-checker-release-gate-readiness";
    readonly releaseBundleCommand: "pnpm check:rust-release-bundle";
    readonly minimumBoundedLaneCountForRustLaneBundle: 2;
    readonly minimumBoundedLaneCountForRustReleaseBundle: 2;
    readonly checkerBundle: "style-recovery";
    readonly includedInRustLaneBundle: true;
    readonly includedInRustReleaseBundle: false;
  };
}

export interface CheckerSourceMissingFindingV0 {
  readonly filePath: string;
  readonly code: string;
  readonly severity: string;
  readonly range: {
    readonly start: {
      readonly line: number;
      readonly character: number;
    };
    readonly end: {
      readonly line: number;
      readonly character: number;
    };
  };
  readonly message: string;
  readonly analysisReason?: string;
  readonly valueCertaintyShapeLabel?: string;
}

export interface CheckerSourceMissingCanonicalCandidateBundleV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly reportVersion: string;
  readonly bundle: "source-missing";
  readonly distinctFileCount: number;
  readonly codeCounts: Readonly<Record<string, number>>;
  readonly summary: {
    readonly warnings: number;
    readonly hints: number;
    readonly total: number;
  };
  readonly findings: readonly CheckerSourceMissingFindingV0[];
}

export interface CheckerSourceMissingCanonicalProducerSignalV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly canonicalCandidate: CheckerSourceMissingCanonicalCandidateBundleV0;
  readonly boundedCheckerGate: {
    readonly canonicalCandidateCommand: "pnpm check:rust-checker-source-missing-canonical-candidate";
    readonly canonicalProducerCommand: "pnpm check:rust-checker-source-missing-canonical-producer";
    readonly consumerBoundaryCommand: "pnpm check:rust-checker-source-missing-consumer-boundary";
    readonly boundedCheckerLaneCommand: "pnpm check:rust-checker-bounded-lanes";
    readonly promotionReviewCommand: "pnpm check:rust-checker-promotion-review";
    readonly promotionEvidenceCommand: "pnpm check:rust-checker-promotion-evidence";
    readonly broaderRustLaneCommand: "pnpm check:rust-lane-bundle";
    readonly releaseGateReadinessCommand: "pnpm check:rust-checker-release-gate-readiness";
    readonly releaseBundleCommand: "pnpm check:rust-release-bundle";
    readonly minimumBoundedLaneCountForRustLaneBundle: 2;
    readonly minimumBoundedLaneCountForRustReleaseBundle: 2;
    readonly checkerBundle: "source-missing";
    readonly includedInRustLaneBundle: true;
    readonly includedInRustReleaseBundle: false;
  };
}

export async function runShadow(snapshot: unknown): Promise<ShadowSummaryV0> {
  return runShadowJson<ShadowSummaryV0>([], snapshot);
}

export async function runShadowTypeFactInput(
  input: EngineInputV2,
): Promise<TypeFactInputSummaryV0> {
  return runShadowJson<TypeFactInputSummaryV0>(["input-type-facts"], input);
}

export async function runShadowQueryPlanInput(input: EngineInputV2): Promise<QueryPlanSummaryV0> {
  return runShadowJson<QueryPlanSummaryV0>(["input-query-plan"], input);
}

export async function runShadowExpressionDomainInput(
  input: EngineInputV2,
): Promise<ExpressionDomainPlanSummaryV0> {
  return runShadowJson<ExpressionDomainPlanSummaryV0>(["input-expression-domains"], input);
}

export async function runShadowExpressionDomainFragmentsInput(
  input: EngineInputV2,
): Promise<ExpressionDomainFragmentsV0> {
  return runShadowJson<ExpressionDomainFragmentsV0>(["input-expression-domain-fragments"], input);
}

export async function runShadowExpressionDomainCandidatesInput(
  input: EngineInputV2,
): Promise<ExpressionDomainCandidatesV0> {
  return runShadowJson<ExpressionDomainCandidatesV0>(["input-expression-domain-candidates"], input);
}

export async function runShadowExpressionDomainCanonicalCandidateInput(
  input: EngineInputV2,
): Promise<ExpressionDomainCanonicalCandidateBundleV0> {
  return runShadowJson<ExpressionDomainCanonicalCandidateBundleV0>(
    ["input-expression-domain-canonical-candidate"],
    input,
  );
}

export async function runShadowExpressionDomainEvaluatorCandidatesInput(
  input: EngineInputV2,
): Promise<ExpressionDomainEvaluatorCandidatesV0> {
  return runShadowJson<ExpressionDomainEvaluatorCandidatesV0>(
    ["input-expression-domain-evaluator-candidates"],
    input,
  );
}

export async function runShadowExpressionDomainCanonicalProducerInput(
  input: EngineInputV2,
): Promise<ExpressionDomainCanonicalProducerSignalV0> {
  return runShadowJson<ExpressionDomainCanonicalProducerSignalV0>(
    ["input-expression-domain-canonical-producer"],
    input,
  );
}

export async function runShadowSelectorUsagePlanInput(
  input: EngineInputV2,
): Promise<SelectorUsagePlanSummaryV0> {
  return runShadowJson<SelectorUsagePlanSummaryV0>(["input-selector-usage-plan"], input);
}

export async function runShadowSelectorUsageFragmentsInput(
  input: EngineInputV2,
): Promise<SelectorUsageFragmentsV0> {
  return runShadowJson<SelectorUsageFragmentsV0>(["input-selector-usage-fragments"], input);
}

export async function runShadowSelectorUsageQueryFragmentsInput(
  input: EngineInputV2,
): Promise<SelectorUsageQueryFragmentsV0> {
  return runShadowJson<SelectorUsageQueryFragmentsV0>(
    ["input-selector-usage-query-fragments"],
    input,
  );
}

export async function runShadowSourceResolutionPlanInput(
  input: EngineInputV2,
): Promise<SourceResolutionPlanSummaryV0> {
  return runShadowJson<SourceResolutionPlanSummaryV0>(["input-source-resolution-plan"], input);
}

export async function runShadowSourceResolutionQueryFragmentsInput(
  input: EngineInputV2,
): Promise<SourceResolutionQueryFragmentsV0> {
  return runShadowJson<SourceResolutionQueryFragmentsV0>(
    ["input-source-resolution-query-fragments"],
    input,
  );
}

export async function runShadowSourceResolutionMatchFragmentsInput(
  input: EngineInputV2,
): Promise<SourceResolutionMatchFragmentsV0> {
  return runShadowJson<SourceResolutionMatchFragmentsV0>(
    ["input-source-resolution-match-fragments"],
    input,
  );
}

export async function runShadowSourceResolutionCandidatesInput(
  input: EngineInputV2,
): Promise<SourceResolutionCandidatesV0> {
  return runShadowJson<SourceResolutionCandidatesV0>(["input-source-resolution-candidates"], input);
}

export async function runShadowSourceResolutionEvaluatorCandidatesInput(
  input: EngineInputV2,
): Promise<SourceResolutionEvaluatorCandidatesV0> {
  return runShadowJson<SourceResolutionEvaluatorCandidatesV0>(
    ["input-source-resolution-evaluator-candidates"],
    input,
  );
}

export async function runShadowSourceResolutionCanonicalCandidateInput(
  input: EngineInputV2,
): Promise<SourceResolutionCanonicalCandidateBundleV0> {
  return runShadowJson<SourceResolutionCanonicalCandidateBundleV0>(
    ["input-source-resolution-canonical-candidate"],
    input,
  );
}

export async function runShadowSourceResolutionCanonicalProducerInput(
  input: EngineInputV2,
): Promise<SourceResolutionCanonicalProducerSignalV0> {
  return runShadowJson<SourceResolutionCanonicalProducerSignalV0>(
    ["input-source-resolution-canonical-producer"],
    input,
  );
}

export async function runShadowExpressionSemanticsFragmentsInput(
  input: EngineInputV2,
): Promise<ExpressionSemanticsFragmentsV0> {
  return runShadowJson<ExpressionSemanticsFragmentsV0>(
    ["input-expression-semantics-fragments"],
    input,
  );
}

export async function runShadowExpressionSemanticsQueryFragmentsInput(
  input: EngineInputV2,
): Promise<ExpressionSemanticsQueryFragmentsV0> {
  return runShadowJson<ExpressionSemanticsQueryFragmentsV0>(
    ["input-expression-semantics-query-fragments"],
    input,
  );
}

export async function runShadowExpressionSemanticsMatchFragmentsInput(
  input: EngineInputV2,
): Promise<ExpressionSemanticsMatchFragmentsV0> {
  return runShadowJson<ExpressionSemanticsMatchFragmentsV0>(
    ["input-expression-semantics-match-fragments"],
    input,
  );
}

export async function runShadowExpressionSemanticsCandidatesInput(
  input: EngineInputV2,
): Promise<ExpressionSemanticsCandidatesV0> {
  return runShadowJson<ExpressionSemanticsCandidatesV0>(
    ["input-expression-semantics-candidates"],
    input,
  );
}

export async function runShadowExpressionSemanticsCanonicalCandidateInput(
  input: EngineInputV2,
): Promise<ExpressionSemanticsCanonicalCandidateBundleV0> {
  return runShadowJson<ExpressionSemanticsCanonicalCandidateBundleV0>(
    ["input-expression-semantics-canonical-candidate"],
    input,
  );
}

export async function runShadowExpressionSemanticsEvaluatorCandidatesInput(
  input: EngineInputV2,
): Promise<ExpressionSemanticsEvaluatorCandidatesV0> {
  return runShadowJson<ExpressionSemanticsEvaluatorCandidatesV0>(
    ["input-expression-semantics-evaluator-candidates"],
    input,
  );
}

export async function runShadowExpressionSemanticsCanonicalProducerInput(
  input: EngineInputV2,
): Promise<ExpressionSemanticsCanonicalProducerSignalV0> {
  return runShadowJson<ExpressionSemanticsCanonicalProducerSignalV0>(
    ["input-expression-semantics-canonical-producer"],
    input,
  );
}

export async function runShadowSourceSideCanonicalProducerInput(
  input: EngineInputV2,
): Promise<SourceSideCanonicalProducerSignalV0> {
  return runShadowJson<SourceSideCanonicalProducerSignalV0>(
    ["input-source-side-canonical-producer"],
    input,
  );
}

export async function runShadowSourceSideCanonicalCandidateInput(
  input: EngineInputV2,
): Promise<SourceSideCanonicalCandidateBundleV0> {
  return runShadowJson<SourceSideCanonicalCandidateBundleV0>(
    ["input-source-side-canonical-candidate"],
    input,
  );
}

export async function runShadowSourceSideEvaluatorCandidatesInput(
  input: EngineInputV2,
): Promise<SourceSideEvaluatorCandidatesV0> {
  return runShadowJson<SourceSideEvaluatorCandidatesV0>(
    ["input-source-side-evaluator-candidates"],
    input,
  );
}

export async function runShadowSemanticCanonicalCandidateInput(
  input: EngineInputV2,
): Promise<SemanticCanonicalCandidateBundleV0> {
  return runShadowJson<SemanticCanonicalCandidateBundleV0>(
    ["input-semantic-canonical-candidate"],
    input,
  );
}

export async function runShadowSemanticEvaluatorCandidatesInput(
  input: EngineInputV2,
): Promise<SemanticEvaluatorCandidatesV0> {
  return runShadowJson<SemanticEvaluatorCandidatesV0>(
    ["input-semantic-evaluator-candidates"],
    input,
  );
}

export async function runShadowSemanticCanonicalProducerInput(
  input: EngineInputV2,
): Promise<SemanticCanonicalProducerSignalV0> {
  return runShadowJson<SemanticCanonicalProducerSignalV0>(
    ["input-semantic-canonical-producer"],
    input,
  );
}

export async function runShadowSourceResolutionFragmentsInput(
  input: EngineInputV2,
): Promise<SourceResolutionFragmentsV0> {
  return runShadowJson<SourceResolutionFragmentsV0>(["input-source-resolution-fragments"], input);
}

export async function runShadowCheckerStyleRecoveryCanonicalCandidate(
  snapshot: unknown,
): Promise<CheckerStyleRecoveryCanonicalCandidateBundleV0> {
  return runShadowJson<CheckerStyleRecoveryCanonicalCandidateBundleV0>(
    ["output-checker-style-recovery-canonical-candidate"],
    snapshot,
  );
}

export async function runShadowCheckerStyleRecoveryCanonicalProducer(
  snapshot: unknown,
): Promise<CheckerStyleRecoveryCanonicalProducerSignalV0> {
  return runShadowJson<CheckerStyleRecoveryCanonicalProducerSignalV0>(
    ["output-checker-style-recovery-canonical-producer"],
    snapshot,
  );
}

export async function runShadowCheckerSourceMissingCanonicalCandidate(
  snapshot: unknown,
): Promise<CheckerSourceMissingCanonicalCandidateBundleV0> {
  return runShadowJson<CheckerSourceMissingCanonicalCandidateBundleV0>(
    ["output-checker-source-missing-canonical-candidate"],
    snapshot,
  );
}

export async function runShadowCheckerSourceMissingCanonicalProducer(
  snapshot: unknown,
): Promise<CheckerSourceMissingCanonicalProducerSignalV0> {
  return runShadowJson<CheckerSourceMissingCanonicalProducerSignalV0>(
    ["output-checker-source-missing-canonical-producer"],
    snapshot,
  );
}

function runShadowJson<T>(args: string[], payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cargo",
      [
        "run",
        "--manifest-path",
        RUST_MANIFEST,
        "-p",
        "engine-shadow-runner",
        "--quiet",
        "--",
        ...args,
      ],
      {
        cwd: REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [`engine-shadow-runner exited with code ${code}`, stderr.join("").trim()]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout.join("")) as T);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

export function deriveTsShadowSummary(snapshot: EngineParitySnapshotV2): ShadowSummaryV0 {
  const byKind: Record<string, number> = {};
  const constrainedKinds: Record<string, number> = {};
  const queryKindCounts: Record<string, number> = {};
  const expressionValueDomainKinds: Record<string, number> = {};
  const expressionValueConstraintKinds: Record<string, number> = {};
  const expressionConstraintDetailCounts = createConstraintDetailCounts();
  const expressionValueCertaintyShapes: Record<string, number> = {};
  const expressionSelectorCertaintyShapes: Record<string, number> = {};
  const resolutionValueConstraintKinds: Record<string, number> = {};
  const resolutionConstraintDetailCounts = createConstraintDetailCounts();
  const resolutionValueCertaintyShapes: Record<string, number> = {};
  const resolutionSelectorCertaintyShapes: Record<string, number> = {};
  const distinctFactFiles = new Set<string>();
  let finiteValueCount = 0;
  let selectorUsageReferencedCount = 0;
  let selectorUsageUnreferencedCount = 0;
  let selectorUsageTotalReferences = 0;
  let selectorUsageDirectReferences = 0;
  let selectorUsageEditableDirectReferences = 0;
  let selectorUsageExactReferences = 0;
  let selectorUsageInferredOrBetterReferences = 0;
  let selectorUsageExpandedCount = 0;
  let selectorUsageStyleDependencyCount = 0;
  let expectedExpressionSemanticsCount = 0;
  let expectedSourceExpressionResolutionCount = 0;
  let expectedSelectorUsageCount = 0;
  const expectedExpressionIds = new Set<string>();
  const expectedSelectorUsageIds = new Set<string>();
  const expressionSemanticsIds = new Set<string>();
  const resolutionIds = new Set<string>();
  const selectorUsageIds = new Set<string>();

  for (const source of snapshot.input.sources) {
    expectedExpressionSemanticsCount += source.document.classExpressions.length;
    for (const expression of source.document.classExpressions) {
      expectedExpressionIds.add(expression.id);
    }
  }
  expectedSourceExpressionResolutionCount = expectedExpressionSemanticsCount;
  for (const style of snapshot.input.styles) {
    expectedSelectorUsageCount += style.document.selectors.filter(
      (selector) => selector.viewKind === "canonical",
    ).length;
    for (const selector of style.document.selectors) {
      if (selector.viewKind === "canonical") {
        expectedSelectorUsageIds.add(selector.canonicalName);
      }
    }
  }

  for (const entry of snapshot.input.typeFacts) {
    distinctFactFiles.add(entry.filePath);
    byKind[entry.facts.kind] = (byKind[entry.facts.kind] ?? 0) + 1;

    if (entry.facts.kind === "finiteSet") {
      finiteValueCount += entry.facts.values.length;
    }

    if (entry.facts.kind === "constrained") {
      constrainedKinds[entry.facts.constraintKind] =
        (constrainedKinds[entry.facts.constraintKind] ?? 0) + 1;
    }
  }

  for (const query of snapshot.output.queryResults) {
    queryKindCounts[query.kind] = (queryKindCounts[query.kind] ?? 0) + 1;
    collectQueryPayloadSummary(
      query,
      expressionValueDomainKinds,
      expressionValueConstraintKinds,
      expressionConstraintDetailCounts,
      expressionValueCertaintyShapes,
      expressionSelectorCertaintyShapes,
      resolutionValueConstraintKinds,
      resolutionConstraintDetailCounts,
      resolutionValueCertaintyShapes,
      resolutionSelectorCertaintyShapes,
      expressionSemanticsIds,
      resolutionIds,
      selectorUsageIds,
      (payload) => {
        selectorUsageTotalReferences += payload.totalReferences;
        selectorUsageDirectReferences += payload.directReferenceCount;
        selectorUsageEditableDirectReferences += payload.editableDirectReferenceCount;
        selectorUsageExactReferences += payload.exactReferenceCount;
        selectorUsageInferredOrBetterReferences += payload.inferredOrBetterReferenceCount;
        if (payload.hasExpandedReferences) {
          selectorUsageExpandedCount += 1;
        }
        if (payload.hasStyleDependencyReferences) {
          selectorUsageStyleDependencyCount += 1;
        }
        const used = payload.hasAnyReferences;
        if (used) {
          selectorUsageReferencedCount += 1;
        } else {
          selectorUsageUnreferencedCount += 1;
        }
      },
    );
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    sourceCount: snapshot.input.sources.length,
    styleCount: snapshot.input.styles.length,
    typeFactCount: snapshot.input.typeFacts.length,
    distinctFactFiles: distinctFactFiles.size,
    byKind,
    constrainedKinds,
    finiteValueCount,
    queryResultCount: snapshot.output.queryResults.length,
    queryKindCounts,
    expressionValueDomainKinds,
    expressionValueConstraintKinds,
    expressionConstraintDetailCounts,
    expressionValueCertaintyShapes,
    expressionSelectorCertaintyShapes,
    resolutionValueConstraintKinds,
    resolutionConstraintDetailCounts,
    resolutionValueCertaintyShapes,
    resolutionSelectorCertaintyShapes,
    selectorUsageReferencedCount,
    selectorUsageUnreferencedCount,
    selectorUsageTotalReferences,
    selectorUsageDirectReferences,
    selectorUsageEditableDirectReferences,
    selectorUsageExactReferences,
    selectorUsageInferredOrBetterReferences,
    selectorUsageExpandedCount,
    selectorUsageStyleDependencyCount,
    expectedExpressionSemanticsCount,
    expectedSourceExpressionResolutionCount,
    expectedSelectorUsageCount,
    expectedTotalQueryCount:
      expectedExpressionSemanticsCount +
      expectedSourceExpressionResolutionCount +
      expectedSelectorUsageCount,
    matchedExpressionQueryPairs: [...expectedExpressionIds].filter(
      (id) => expressionSemanticsIds.has(id) && resolutionIds.has(id),
    ).length,
    missingExpressionSemanticsCount: [...expectedExpressionIds].filter(
      (id) => !expressionSemanticsIds.has(id),
    ).length,
    missingSourceExpressionResolutionCount: [...expectedExpressionIds].filter(
      (id) => !resolutionIds.has(id),
    ).length,
    unexpectedExpressionSemanticsCount: [...expressionSemanticsIds].filter(
      (id) => !expectedExpressionIds.has(id),
    ).length,
    unexpectedSourceExpressionResolutionCount: [...resolutionIds].filter(
      (id) => !expectedExpressionIds.has(id),
    ).length,
    matchedSelectorUsageCount: [...expectedSelectorUsageIds].filter((id) =>
      selectorUsageIds.has(id),
    ).length,
    missingSelectorUsageCount: [...expectedSelectorUsageIds].filter(
      (id) => !selectorUsageIds.has(id),
    ).length,
    unexpectedSelectorUsageCount: [...selectorUsageIds].filter(
      (id) => !expectedSelectorUsageIds.has(id),
    ).length,
    rewritePlanCount: snapshot.output.rewritePlans.length,
    checkerWarningCount: snapshot.output.checkerReport.summary.warnings,
    checkerHintCount: snapshot.output.checkerReport.summary.hints,
    checkerTotalFindings: snapshot.output.checkerReport.summary.total,
  };
}

export function deriveTsTypeFactInputSummary(
  snapshot: EngineParitySnapshotV2,
): TypeFactInputSummaryV0 {
  const byKind: Record<string, number> = {};
  const constrainedKinds: Record<string, number> = {};
  const distinctFactFiles = new Set<string>();
  let finiteValueCount = 0;

  for (const entry of snapshot.input.typeFacts) {
    distinctFactFiles.add(entry.filePath);
    byKind[entry.facts.kind] = (byKind[entry.facts.kind] ?? 0) + 1;

    if (entry.facts.kind === "finiteSet") {
      finiteValueCount += entry.facts.values.length;
    }

    if (entry.facts.kind === "constrained") {
      constrainedKinds[entry.facts.constraintKind] =
        (constrainedKinds[entry.facts.constraintKind] ?? 0) + 1;
    }
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    typeFactCount: snapshot.input.typeFacts.length,
    distinctFactFiles: distinctFactFiles.size,
    byKind,
    constrainedKinds,
    finiteValueCount,
  };
}

export function deriveTsQueryPlanSummary(snapshot: EngineParitySnapshotV2): QueryPlanSummaryV0 {
  const expressionIds = snapshot.input.sources.flatMap((source) =>
    source.document.classExpressions.map((expression) => expression.id),
  );
  const selectorUsageIds = snapshot.input.styles.flatMap((style) =>
    style.document.selectors
      .filter((selector) => selector.viewKind === "canonical")
      .map((selector) => selector.canonicalName),
  );

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    expressionSemanticsIds: expressionIds,
    sourceExpressionResolutionIds: expressionIds,
    selectorUsageIds,
    totalQueryCount: expressionIds.length * 2 + selectorUsageIds.length,
  };
}

export function deriveTsExpressionDomainPlanSummary(
  snapshot: EngineParitySnapshotV2,
): ExpressionDomainPlanSummaryV0 {
  const valueDomainKinds: Record<string, number> = {};
  const valueConstraintKinds: Record<string, number> = {};
  const constraintDetailCounts = createConstraintDetailCounts();
  const plannedExpressionIds: string[] = [];
  let finiteValueCount = 0;

  for (const entry of snapshot.input.typeFacts) {
    plannedExpressionIds.push(entry.expressionId);
    increment(valueDomainKinds, entry.facts.kind);
    if (entry.facts.kind === "finiteSet") {
      finiteValueCount += entry.facts.values.length;
    }
    if (entry.facts.kind === "constrained") {
      increment(valueConstraintKinds, entry.facts.constraintKind);
    }
    collectConstraintDetailCounts(
      constraintDetailCounts,
      entry.facts.prefix,
      entry.facts.suffix,
      entry.facts.minLen,
      entry.facts.maxLen,
      entry.facts.charMust,
      entry.facts.charMay,
      entry.facts.mayIncludeOtherChars === true,
    );
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    plannedExpressionIds,
    valueDomainKinds,
    valueConstraintKinds,
    constraintDetailCounts,
    finiteValueCount,
  };
}

export function deriveTsExpressionDomainFragments(
  snapshot: EngineParitySnapshotV2,
): ExpressionDomainFragmentsV0 {
  const fragments = snapshot.input.typeFacts
    .map((entry) => {
      const fragment: ExpressionDomainFragmentV0 = {
        expressionId: entry.expressionId,
        filePath: entry.filePath,
        valueDomainKind: entry.facts.kind,
        finiteValueCount: entry.facts.values?.length ?? 0,
      };
      if (entry.facts.constraintKind) {
        fragment.valueConstraintKind = entry.facts.constraintKind;
      }
      if (entry.facts.prefix) {
        fragment.valuePrefix = entry.facts.prefix;
      }
      if (entry.facts.suffix) {
        fragment.valueSuffix = entry.facts.suffix;
      }
      if (entry.facts.minLen !== undefined) {
        fragment.valueMinLen = entry.facts.minLen;
      }
      if (entry.facts.maxLen !== undefined) {
        fragment.valueMaxLen = entry.facts.maxLen;
      }
      if (entry.facts.charMust) {
        fragment.valueCharMust = entry.facts.charMust;
      }
      if (entry.facts.charMay) {
        fragment.valueCharMay = entry.facts.charMay;
      }
      if (entry.facts.mayIncludeOtherChars) {
        fragment.valueMayIncludeOtherChars = true;
      }
      return fragment;
    })
    .toSorted((a, b) => a.expressionId.localeCompare(b.expressionId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsExpressionDomainCandidates(
  snapshot: EngineParitySnapshotV2,
): ExpressionDomainCandidatesV0 {
  const candidates = deriveTsExpressionDomainFragments(snapshot).fragments.map((fragment) => {
    const candidate: ExpressionDomainCandidateV0 = {
      expressionId: fragment.expressionId,
      filePath: fragment.filePath,
      valueDomainKind: fragment.valueDomainKind,
      finiteValueCount: fragment.finiteValueCount,
    };
    if (fragment.valueConstraintKind) {
      candidate.valueConstraintKind = fragment.valueConstraintKind;
    }
    if (fragment.valuePrefix) {
      candidate.valuePrefix = fragment.valuePrefix;
    }
    if (fragment.valueSuffix) {
      candidate.valueSuffix = fragment.valueSuffix;
    }
    if (fragment.valueMinLen !== undefined) {
      candidate.valueMinLen = fragment.valueMinLen;
    }
    if (fragment.valueMaxLen !== undefined) {
      candidate.valueMaxLen = fragment.valueMaxLen;
    }
    if (fragment.valueCharMust) {
      candidate.valueCharMust = fragment.valueCharMust;
    }
    if (fragment.valueCharMay) {
      candidate.valueCharMay = fragment.valueCharMay;
    }
    if (fragment.valueMayIncludeOtherChars) {
      candidate.valueMayIncludeOtherChars = true;
    }
    return candidate;
  });

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    candidates,
  };
}

export function deriveTsExpressionDomainCanonicalCandidateBundle(
  snapshot: EngineParitySnapshotV2,
): ExpressionDomainCanonicalCandidateBundleV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    planSummary: deriveTsExpressionDomainPlanSummary(snapshot),
    fragments: deriveTsExpressionDomainFragments(snapshot).fragments,
    candidates: deriveTsExpressionDomainCandidates(snapshot).candidates,
  };
}

export function deriveTsExpressionDomainEvaluatorCandidates(
  snapshot: EngineParitySnapshotV2,
): ExpressionDomainEvaluatorCandidatesV0 {
  const results = snapshot.output.queryResults
    .filter((query) => query.kind === "expression-semantics")
    .map((query) => ({
      kind: "expression-domain" as const,
      filePath: query.filePath,
      queryId: query.queryId,
      payload: {
        expressionId: query.payload.expressionId,
        valueDomainKind: query.payload.valueDomainKind,
        ...(query.payload.valueConstraintKind
          ? { valueConstraintKind: query.payload.valueConstraintKind }
          : {}),
        ...(query.payload.valuePrefix ? { valuePrefix: query.payload.valuePrefix } : {}),
        ...(query.payload.valueSuffix ? { valueSuffix: query.payload.valueSuffix } : {}),
        ...(query.payload.valueMinLen !== undefined
          ? { valueMinLen: query.payload.valueMinLen }
          : {}),
        ...(query.payload.valueMaxLen !== undefined
          ? { valueMaxLen: query.payload.valueMaxLen }
          : {}),
        ...(query.payload.valueCharMust ? { valueCharMust: query.payload.valueCharMust } : {}),
        ...(query.payload.valueCharMay ? { valueCharMay: query.payload.valueCharMay } : {}),
        ...(query.payload.valueMayIncludeOtherChars ? { valueMayIncludeOtherChars: true } : {}),
        finiteValueCount: query.payload.finiteValues?.length ?? 0,
      },
    }))
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    results,
  };
}

export function deriveTsExpressionDomainCanonicalProducerSignal(
  snapshot: EngineParitySnapshotV2,
): ExpressionDomainCanonicalProducerSignalV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    canonicalBundle: deriveTsExpressionDomainCanonicalCandidateBundle(snapshot),
    evaluatorCandidates: deriveTsExpressionDomainEvaluatorCandidates(snapshot),
  };
}

export function deriveTsSelectorUsagePlanSummary(
  snapshot: EngineParitySnapshotV2,
): SelectorUsagePlanSummaryV0 {
  const canonicalSelectorNames: string[] = [];
  const viewKindCounts: Record<string, number> = {};
  const nestedSafetyCounts: Record<string, number> = {};
  let composedSelectorCount = 0;
  let totalComposesRefs = 0;

  for (const style of snapshot.input.styles) {
    for (const selector of style.document.selectors) {
      increment(viewKindCounts, selector.viewKind);
      increment(nestedSafetyCounts, selector.nestedSafety);
      if (selector.composes.length > 0) {
        composedSelectorCount += 1;
        totalComposesRefs += selector.composes.length;
      }
      if (selector.viewKind === "canonical") {
        canonicalSelectorNames.push(selector.canonicalName);
      }
    }
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    canonicalSelectorNames,
    viewKindCounts,
    nestedSafetyCounts,
    composedSelectorCount,
    totalComposesRefs,
  };
}

export function deriveTsSelectorUsageFragments(
  snapshot: EngineParitySnapshotV2,
): SelectorUsageFragmentsV0 {
  const fragments: SelectorUsageFragmentV0[] = [];

  for (const style of snapshot.input.styles) {
    for (const [ordinal, selector] of style.document.selectors.entries()) {
      const fragment: SelectorUsageFragmentV0 = { ordinal, viewKind: selector.viewKind };
      if (selector.canonicalName) {
        fragment.canonicalName = selector.canonicalName;
      }
      if (selector.nestedSafety) {
        fragment.nestedSafety = selector.nestedSafety;
      }
      fragment.composesCount = selector.composes.length;
      fragments.push(fragment);
    }
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsSelectorUsageQueryFragments(
  snapshot: EngineParitySnapshotV2,
): SelectorUsageQueryFragmentsV0 {
  const fragments: SelectorUsageQueryFragmentV0[] = [];

  for (const style of snapshot.input.styles) {
    for (const selector of style.document.selectors) {
      if (selector.viewKind !== "canonical") {
        continue;
      }
      const fragment: SelectorUsageQueryFragmentV0 = {
        queryId: selector.canonicalName,
        canonicalName: selector.canonicalName,
      };
      if (selector.nestedSafety) {
        fragment.nestedSafety = selector.nestedSafety;
      }
      fragment.composesCount = selector.composes.length;
      fragments.push(fragment);
    }
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments: fragments.toSorted((a, b) => a.queryId.localeCompare(b.queryId)),
  };
}

export function deriveTsSourceResolutionPlanSummary(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionPlanSummaryV0 {
  const plannedExpressionIds: string[] = [];
  const expressionKindCounts: Record<string, number> = {};
  const distinctStyleFilePaths = new Set<string>();
  let symbolRefWithBindingCount = 0;
  let styleAccessCount = 0;
  let styleAccessPathDepthSum = 0;

  for (const source of snapshot.input.sources) {
    for (const expression of source.document.classExpressions) {
      plannedExpressionIds.push(expression.id);
      increment(expressionKindCounts, expression.kind);
      distinctStyleFilePaths.add(expression.scssModulePath);
      if (expression.kind === "symbolRef" && expression.rootBindingDeclId) {
        symbolRefWithBindingCount += 1;
      }
      if (expression.kind === "styleAccess") {
        styleAccessCount += 1;
        styleAccessPathDepthSum += expression.accessPath.length;
      }
    }
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    plannedExpressionIds,
    expressionKindCounts,
    distinctStyleFilePaths: [...distinctStyleFilePaths].toSorted((a, b) => a.localeCompare(b)),
    symbolRefWithBindingCount,
    styleAccessCount,
    styleAccessPathDepthSum,
  };
}

export function deriveTsSourceResolutionQueryFragments(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionQueryFragmentsV0 {
  const fragments = snapshot.input.sources
    .flatMap((source) =>
      source.document.classExpressions.map((expression) => ({
        queryId: expression.id,
        expressionId: expression.id,
        expressionKind: expression.kind,
        styleFilePath: expression.scssModulePath,
      })),
    )
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsExpressionSemanticsFragments(
  snapshot: EngineParitySnapshotV2,
): ExpressionSemanticsFragmentsV0 {
  const fragments = snapshot.output.queryResults
    .filter((query) => query.kind === "expression-semantics")
    .map((query) => {
      const fragment: ExpressionSemanticsFragmentV0 = {
        queryId: query.queryId,
        expressionId: query.payload.expressionId,
        expressionKind: query.payload.expressionKind,
        styleFilePath: query.payload.styleFilePath ?? "",
        valueDomainKind: query.payload.valueDomainKind,
      };
      if (query.payload.valueConstraintKind) {
        fragment.valueConstraintKind = query.payload.valueConstraintKind;
      }
      if (query.payload.valuePrefix) {
        fragment.valuePrefix = query.payload.valuePrefix;
      }
      if (query.payload.valueSuffix) {
        fragment.valueSuffix = query.payload.valueSuffix;
      }
      if (query.payload.valueMinLen !== undefined) {
        fragment.valueMinLen = query.payload.valueMinLen;
      }
      if (query.payload.valueMaxLen !== undefined) {
        fragment.valueMaxLen = query.payload.valueMaxLen;
      }
      if (query.payload.valueCharMust) {
        fragment.valueCharMust = query.payload.valueCharMust;
      }
      if (query.payload.valueCharMay) {
        fragment.valueCharMay = query.payload.valueCharMay;
      }
      if (query.payload.valueMayIncludeOtherChars) {
        fragment.valueMayIncludeOtherChars = true;
      }
      return fragment;
    })
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsExpressionSemanticsQueryFragments(
  snapshot: EngineParitySnapshotV2,
): ExpressionSemanticsQueryFragmentsV0 {
  const fragments = snapshot.input.sources
    .flatMap((source) =>
      source.document.classExpressions.map((expression) => ({
        queryId: expression.id,
        expressionId: expression.id,
        expressionKind: expression.kind,
        styleFilePath: expression.scssModulePath,
      })),
    )
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsExpressionSemanticsMatchFragments(
  snapshot: EngineParitySnapshotV2,
): ExpressionSemanticsMatchFragmentsV0 {
  const fragments = snapshot.output.queryResults
    .filter((query) => query.kind === "expression-semantics")
    .map((query) => {
      const fragment: ExpressionSemanticsMatchFragmentV0 = {
        queryId: query.queryId,
        expressionId: query.payload.expressionId,
        styleFilePath: query.payload.styleFilePath ?? "",
        selectorNames: query.payload.selectorNames,
        candidateNames: query.payload.candidateNames,
      };
      if (query.payload.finiteValues) {
        fragment.finiteValues = query.payload.finiteValues;
      }
      return fragment;
    })
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsExpressionSemanticsCandidates(
  snapshot: EngineParitySnapshotV2,
): ExpressionSemanticsCandidatesV0 {
  const candidates = snapshot.output.queryResults
    .filter((query) => query.kind === "expression-semantics")
    .map((query) => {
      const candidate: ExpressionSemanticsCandidateV0 = {
        queryId: query.queryId,
        expressionId: query.payload.expressionId,
        expressionKind: query.payload.expressionKind,
        styleFilePath: query.payload.styleFilePath ?? "",
        selectorNames: query.payload.selectorNames,
        candidateNames: query.payload.candidateNames,
      };
      if (query.payload.finiteValues) {
        candidate.finiteValues = query.payload.finiteValues;
      }
      candidate.valueDomainKind = query.payload.valueDomainKind;
      candidate.selectorCertainty = query.payload.selectorCertainty;
      if (query.payload.valueCertainty) {
        candidate.valueCertainty = query.payload.valueCertainty;
      }
      candidate.selectorCertaintyShapeKind = query.payload.selectorCertaintyShapeKind ?? "unknown";
      candidate.selectorCertaintyShapeLabel =
        query.payload.selectorCertaintyShapeLabel ?? "unknown";
      candidate.valueCertaintyShapeKind = query.payload.valueCertaintyShapeKind ?? "unknown";
      candidate.valueCertaintyShapeLabel = query.payload.valueCertaintyShapeLabel ?? "unknown";
      if (query.payload.selectorConstraintKind) {
        candidate.selectorConstraintKind = query.payload.selectorConstraintKind;
      }
      if (query.payload.valueCertaintyConstraintKind) {
        candidate.valueCertaintyConstraintKind = query.payload.valueCertaintyConstraintKind;
      }
      if (query.payload.valueConstraintKind) {
        candidate.valueConstraintKind = query.payload.valueConstraintKind;
      }
      if (query.payload.valuePrefix) {
        candidate.valuePrefix = query.payload.valuePrefix;
      }
      if (query.payload.valueSuffix) {
        candidate.valueSuffix = query.payload.valueSuffix;
      }
      if (query.payload.valueMinLen !== undefined) {
        candidate.valueMinLen = query.payload.valueMinLen;
      }
      if (query.payload.valueMaxLen !== undefined) {
        candidate.valueMaxLen = query.payload.valueMaxLen;
      }
      if (query.payload.valueCharMust) {
        candidate.valueCharMust = query.payload.valueCharMust;
      }
      if (query.payload.valueCharMay) {
        candidate.valueCharMay = query.payload.valueCharMay;
      }
      if (query.payload.valueMayIncludeOtherChars) {
        candidate.valueMayIncludeOtherChars = true;
      }
      return candidate;
    })
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    candidates,
  };
}

export function deriveTsExpressionSemanticsCanonicalCandidateBundle(
  snapshot: EngineParitySnapshotV2,
): ExpressionSemanticsCanonicalCandidateBundleV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    queryFragments: deriveTsExpressionSemanticsQueryFragments(snapshot).fragments,
    fragments: deriveTsExpressionSemanticsFragments(snapshot).fragments,
    matchFragments: deriveTsExpressionSemanticsMatchFragments(snapshot).fragments,
    candidates: deriveTsExpressionSemanticsCandidates(snapshot).candidates,
  };
}

export function deriveTsExpressionSemanticsEvaluatorCandidates(
  snapshot: EngineParitySnapshotV2,
): ExpressionSemanticsEvaluatorCandidatesV0 {
  const results = snapshot.output.queryResults
    .filter((query) => query.kind === "expression-semantics")
    .map((query) => ({
      kind: "expression-semantics" as const,
      filePath: query.filePath,
      queryId: query.queryId,
      payload: {
        expressionId: query.payload.expressionId,
        expressionKind: query.payload.expressionKind,
        styleFilePath: query.payload.styleFilePath ?? "",
        selectorNames: query.payload.selectorNames,
        candidateNames: query.payload.candidateNames,
        ...(query.payload.finiteValues ? { finiteValues: query.payload.finiteValues } : {}),
        valueDomainKind: query.payload.valueDomainKind,
        selectorCertainty: query.payload.selectorCertainty,
        ...(query.payload.valueCertainty ? { valueCertainty: query.payload.valueCertainty } : {}),
        selectorCertaintyShapeKind: query.payload.selectorCertaintyShapeKind ?? "unknown",
        selectorCertaintyShapeLabel: query.payload.selectorCertaintyShapeLabel ?? "unknown",
        valueCertaintyShapeKind: query.payload.valueCertaintyShapeKind ?? "unknown",
        valueCertaintyShapeLabel: query.payload.valueCertaintyShapeLabel ?? "unknown",
        ...(query.payload.selectorConstraintKind
          ? { selectorConstraintKind: query.payload.selectorConstraintKind }
          : {}),
        ...(query.payload.valueCertaintyConstraintKind
          ? { valueCertaintyConstraintKind: query.payload.valueCertaintyConstraintKind }
          : {}),
        ...(query.payload.valueConstraintKind
          ? { valueConstraintKind: query.payload.valueConstraintKind }
          : {}),
        ...(query.payload.valuePrefix ? { valuePrefix: query.payload.valuePrefix } : {}),
        ...(query.payload.valueSuffix ? { valueSuffix: query.payload.valueSuffix } : {}),
        ...(query.payload.valueMinLen !== undefined
          ? { valueMinLen: query.payload.valueMinLen }
          : {}),
        ...(query.payload.valueMaxLen !== undefined
          ? { valueMaxLen: query.payload.valueMaxLen }
          : {}),
        ...(query.payload.valueCharMust ? { valueCharMust: query.payload.valueCharMust } : {}),
        ...(query.payload.valueCharMay ? { valueCharMay: query.payload.valueCharMay } : {}),
        ...(query.payload.valueMayIncludeOtherChars ? { valueMayIncludeOtherChars: true } : {}),
      },
    }))
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    results,
  };
}

export function deriveTsExpressionSemanticsCanonicalProducerSignal(
  snapshot: EngineParitySnapshotV2,
): ExpressionSemanticsCanonicalProducerSignalV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    canonicalBundle: deriveTsExpressionSemanticsCanonicalCandidateBundle(snapshot),
    evaluatorCandidates: deriveTsExpressionSemanticsEvaluatorCandidates(snapshot),
  };
}

export function deriveTsSourceResolutionFragments(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionFragmentsV0 {
  const fragments = snapshot.output.queryResults
    .filter((query) => query.kind === "source-expression-resolution")
    .map((query) => {
      const fragment: SourceResolutionFragmentV0 = {
        queryId: query.queryId,
        expressionId: query.payload.expressionId,
        styleFilePath: query.payload.styleFilePath ?? "",
        valueCertaintyShapeKind: query.payload.valueCertaintyShapeKind ?? "unknown",
      };
      if (query.payload.valueCertaintyConstraintKind) {
        fragment.valueCertaintyConstraintKind = query.payload.valueCertaintyConstraintKind;
      }
      if (query.payload.valuePrefix) {
        fragment.valuePrefix = query.payload.valuePrefix;
      }
      if (query.payload.valueSuffix) {
        fragment.valueSuffix = query.payload.valueSuffix;
      }
      if (query.payload.valueMinLen !== undefined) {
        fragment.valueMinLen = query.payload.valueMinLen;
      }
      if (query.payload.valueMaxLen !== undefined) {
        fragment.valueMaxLen = query.payload.valueMaxLen;
      }
      if (query.payload.valueCharMust) {
        fragment.valueCharMust = query.payload.valueCharMust;
      }
      if (query.payload.valueCharMay) {
        fragment.valueCharMay = query.payload.valueCharMay;
      }
      if (query.payload.valueMayIncludeOtherChars) {
        fragment.valueMayIncludeOtherChars = true;
      }
      return fragment;
    })
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsSourceResolutionMatchFragments(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionMatchFragmentsV0 {
  const fragments = snapshot.output.queryResults
    .filter((query) => query.kind === "source-expression-resolution")
    .map((query) => {
      const fragment: SourceResolutionMatchFragmentV0 = {
        queryId: query.queryId,
        expressionId: query.payload.expressionId,
        styleFilePath: query.payload.styleFilePath ?? "",
        selectorNames: query.payload.selectorNames,
      };
      if (query.payload.finiteValues) {
        fragment.finiteValues = query.payload.finiteValues;
      }
      return fragment;
    })
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    fragments,
  };
}

export function deriveTsSourceResolutionCandidates(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionCandidatesV0 {
  const candidates = snapshot.output.queryResults
    .filter((query) => query.kind === "source-expression-resolution")
    .map((query) => {
      const candidate: SourceResolutionCandidateV0 = {
        queryId: query.queryId,
        expressionId: query.payload.expressionId,
        styleFilePath: query.payload.styleFilePath ?? "",
        selectorNames: query.payload.selectorNames,
      };
      if (query.payload.finiteValues) {
        candidate.finiteValues = query.payload.finiteValues;
      }
      candidate.selectorCertainty = query.payload.selectorCertainty;
      if (query.payload.valueCertainty) {
        candidate.valueCertainty = query.payload.valueCertainty;
      }
      candidate.selectorCertaintyShapeKind = query.payload.selectorCertaintyShapeKind ?? "unknown";
      candidate.selectorCertaintyShapeLabel =
        query.payload.selectorCertaintyShapeLabel ?? "unknown";
      candidate.valueCertaintyShapeKind = query.payload.valueCertaintyShapeKind ?? "unknown";
      candidate.valueCertaintyShapeLabel = query.payload.valueCertaintyShapeLabel ?? "unknown";
      if (query.payload.selectorConstraintKind) {
        candidate.selectorConstraintKind = query.payload.selectorConstraintKind;
      }
      if (query.payload.valueCertaintyConstraintKind) {
        candidate.valueCertaintyConstraintKind = query.payload.valueCertaintyConstraintKind;
      }
      if (query.payload.valuePrefix) {
        candidate.valuePrefix = query.payload.valuePrefix;
      }
      if (query.payload.valueSuffix) {
        candidate.valueSuffix = query.payload.valueSuffix;
      }
      if (query.payload.valueMinLen !== undefined) {
        candidate.valueMinLen = query.payload.valueMinLen;
      }
      if (query.payload.valueMaxLen !== undefined) {
        candidate.valueMaxLen = query.payload.valueMaxLen;
      }
      if (query.payload.valueCharMust) {
        candidate.valueCharMust = query.payload.valueCharMust;
      }
      if (query.payload.valueCharMay) {
        candidate.valueCharMay = query.payload.valueCharMay;
      }
      if (query.payload.valueMayIncludeOtherChars) {
        candidate.valueMayIncludeOtherChars = true;
      }
      return candidate;
    })
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    candidates,
  };
}

export function deriveTsSourceResolutionEvaluatorCandidates(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionEvaluatorCandidatesV0 {
  const results = snapshot.output.queryResults
    .filter((query) => query.kind === "source-expression-resolution")
    .map((query) => ({
      kind: "source-expression-resolution" as const,
      filePath: query.filePath,
      queryId: query.queryId,
      payload: {
        expressionId: query.payload.expressionId,
        styleFilePath: query.payload.styleFilePath ?? "",
        selectorNames: query.payload.selectorNames,
        ...(query.payload.finiteValues ? { finiteValues: query.payload.finiteValues } : {}),
        selectorCertainty: query.payload.selectorCertainty,
        ...(query.payload.valueCertainty ? { valueCertainty: query.payload.valueCertainty } : {}),
        selectorCertaintyShapeKind: query.payload.selectorCertaintyShapeKind ?? "unknown",
        selectorCertaintyShapeLabel: query.payload.selectorCertaintyShapeLabel ?? "unknown",
        valueCertaintyShapeKind: query.payload.valueCertaintyShapeKind ?? "unknown",
        valueCertaintyShapeLabel: query.payload.valueCertaintyShapeLabel ?? "unknown",
        ...(query.payload.selectorConstraintKind
          ? { selectorConstraintKind: query.payload.selectorConstraintKind }
          : {}),
        ...(query.payload.valueCertaintyConstraintKind
          ? { valueCertaintyConstraintKind: query.payload.valueCertaintyConstraintKind }
          : {}),
        ...(query.payload.valuePrefix ? { valuePrefix: query.payload.valuePrefix } : {}),
        ...(query.payload.valueSuffix ? { valueSuffix: query.payload.valueSuffix } : {}),
        ...(query.payload.valueMinLen !== undefined
          ? { valueMinLen: query.payload.valueMinLen }
          : {}),
        ...(query.payload.valueMaxLen !== undefined
          ? { valueMaxLen: query.payload.valueMaxLen }
          : {}),
        ...(query.payload.valueCharMust ? { valueCharMust: query.payload.valueCharMust } : {}),
        ...(query.payload.valueCharMay ? { valueCharMay: query.payload.valueCharMay } : {}),
        ...(query.payload.valueMayIncludeOtherChars ? { valueMayIncludeOtherChars: true } : {}),
      },
    }))
    .toSorted((a, b) => a.queryId.localeCompare(b.queryId));

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    results,
  };
}

export function deriveTsSourceResolutionCanonicalCandidateBundle(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionCanonicalCandidateBundleV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    queryFragments: deriveTsSourceResolutionQueryFragments(snapshot).fragments,
    fragments: deriveTsSourceResolutionFragments(snapshot).fragments,
    matchFragments: deriveTsSourceResolutionMatchFragments(snapshot).fragments,
    candidates: deriveTsSourceResolutionCandidates(snapshot).candidates,
  };
}

export function deriveTsSourceResolutionCanonicalProducerSignal(
  snapshot: EngineParitySnapshotV2,
): SourceResolutionCanonicalProducerSignalV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    canonicalBundle: deriveTsSourceResolutionCanonicalCandidateBundle(snapshot),
    evaluatorCandidates: deriveTsSourceResolutionEvaluatorCandidates(snapshot),
  };
}

export function deriveTsSourceSideCanonicalCandidateBundle(
  snapshot: EngineParitySnapshotV2,
): SourceSideCanonicalCandidateBundleV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    expressionSemantics: deriveTsExpressionSemanticsCanonicalCandidateBundle(snapshot),
    sourceResolution: deriveTsSourceResolutionCanonicalCandidateBundle(snapshot),
  };
}

export function deriveTsSourceSideEvaluatorCandidates(
  snapshot: EngineParitySnapshotV2,
): SourceSideEvaluatorCandidatesV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    expressionSemantics: deriveTsExpressionSemanticsEvaluatorCandidates(snapshot),
    sourceResolution: deriveTsSourceResolutionEvaluatorCandidates(snapshot),
  };
}

export function deriveTsSourceSideCanonicalProducerSignal(
  snapshot: EngineParitySnapshotV2,
): SourceSideCanonicalProducerSignalV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    canonicalBundle: deriveTsSourceSideCanonicalCandidateBundle(snapshot),
    evaluatorCandidates: deriveTsSourceSideEvaluatorCandidates(snapshot),
  };
}

export function deriveTsSemanticCanonicalCandidateBundle(
  snapshot: EngineParitySnapshotV2,
): SemanticCanonicalCandidateBundleV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    sourceSide: deriveTsSourceSideCanonicalCandidateBundle(snapshot),
    expressionDomain: deriveTsExpressionDomainCanonicalCandidateBundle(snapshot),
  };
}

export function deriveTsSemanticEvaluatorCandidates(
  snapshot: EngineParitySnapshotV2,
): SemanticEvaluatorCandidatesV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    sourceSide: deriveTsSourceSideEvaluatorCandidates(snapshot),
    expressionDomain: deriveTsExpressionDomainEvaluatorCandidates(snapshot),
  };
}

export function deriveTsSemanticCanonicalProducerSignal(
  snapshot: EngineParitySnapshotV2,
): SemanticCanonicalProducerSignalV0 {
  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    canonicalBundle: deriveTsSemanticCanonicalCandidateBundle(snapshot),
    evaluatorCandidates: deriveTsSemanticEvaluatorCandidates(snapshot),
  };
}

export function assertShadowSummaryMatch(
  label: string,
  actual: ShadowSummaryV0,
  expected: ShadowSummaryV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqualField(label, "sourceCount", actual.sourceCount, expected.sourceCount);
  assertEqualField(label, "styleCount", actual.styleCount, expected.styleCount);
  assertEqualField(label, "typeFactCount", actual.typeFactCount, expected.typeFactCount);
  assertEqualField(
    label,
    "distinctFactFiles",
    actual.distinctFactFiles,
    expected.distinctFactFiles,
  );
  assertEqualField(label, "finiteValueCount", actual.finiteValueCount, expected.finiteValueCount);
  assertEqualField(label, "queryResultCount", actual.queryResultCount, expected.queryResultCount);
  assertEqualField(
    label,
    "selectorUsageReferencedCount",
    actual.selectorUsageReferencedCount,
    expected.selectorUsageReferencedCount,
  );
  assertEqualField(
    label,
    "selectorUsageUnreferencedCount",
    actual.selectorUsageUnreferencedCount,
    expected.selectorUsageUnreferencedCount,
  );
  assertEqualField(
    label,
    "selectorUsageTotalReferences",
    actual.selectorUsageTotalReferences,
    expected.selectorUsageTotalReferences,
  );
  assertEqualField(
    label,
    "selectorUsageDirectReferences",
    actual.selectorUsageDirectReferences,
    expected.selectorUsageDirectReferences,
  );
  assertEqualField(
    label,
    "selectorUsageEditableDirectReferences",
    actual.selectorUsageEditableDirectReferences,
    expected.selectorUsageEditableDirectReferences,
  );
  assertEqualField(
    label,
    "selectorUsageExactReferences",
    actual.selectorUsageExactReferences,
    expected.selectorUsageExactReferences,
  );
  assertEqualField(
    label,
    "selectorUsageInferredOrBetterReferences",
    actual.selectorUsageInferredOrBetterReferences,
    expected.selectorUsageInferredOrBetterReferences,
  );
  assertEqualField(
    label,
    "selectorUsageExpandedCount",
    actual.selectorUsageExpandedCount,
    expected.selectorUsageExpandedCount,
  );
  assertEqualField(
    label,
    "selectorUsageStyleDependencyCount",
    actual.selectorUsageStyleDependencyCount,
    expected.selectorUsageStyleDependencyCount,
  );
  assertEqualField(
    label,
    "expectedExpressionSemanticsCount",
    actual.expectedExpressionSemanticsCount,
    expected.expectedExpressionSemanticsCount,
  );
  assertEqualField(
    label,
    "expectedSourceExpressionResolutionCount",
    actual.expectedSourceExpressionResolutionCount,
    expected.expectedSourceExpressionResolutionCount,
  );
  assertEqualField(
    label,
    "expectedSelectorUsageCount",
    actual.expectedSelectorUsageCount,
    expected.expectedSelectorUsageCount,
  );
  assertEqualField(
    label,
    "expectedTotalQueryCount",
    actual.expectedTotalQueryCount,
    expected.expectedTotalQueryCount,
  );
  assertEqualField(
    label,
    "matchedExpressionQueryPairs",
    actual.matchedExpressionQueryPairs,
    expected.matchedExpressionQueryPairs,
  );
  assertEqualField(
    label,
    "missingExpressionSemanticsCount",
    actual.missingExpressionSemanticsCount,
    expected.missingExpressionSemanticsCount,
  );
  assertEqualField(
    label,
    "missingSourceExpressionResolutionCount",
    actual.missingSourceExpressionResolutionCount,
    expected.missingSourceExpressionResolutionCount,
  );
  assertEqualField(
    label,
    "unexpectedExpressionSemanticsCount",
    actual.unexpectedExpressionSemanticsCount,
    expected.unexpectedExpressionSemanticsCount,
  );
  assertEqualField(
    label,
    "unexpectedSourceExpressionResolutionCount",
    actual.unexpectedSourceExpressionResolutionCount,
    expected.unexpectedSourceExpressionResolutionCount,
  );
  assertEqualField(
    label,
    "matchedSelectorUsageCount",
    actual.matchedSelectorUsageCount,
    expected.matchedSelectorUsageCount,
  );
  assertEqualField(
    label,
    "missingSelectorUsageCount",
    actual.missingSelectorUsageCount,
    expected.missingSelectorUsageCount,
  );
  assertEqualField(
    label,
    "unexpectedSelectorUsageCount",
    actual.unexpectedSelectorUsageCount,
    expected.unexpectedSelectorUsageCount,
  );
  assertEqualField(label, "rewritePlanCount", actual.rewritePlanCount, expected.rewritePlanCount);
  assertEqualField(
    label,
    "checkerWarningCount",
    actual.checkerWarningCount,
    expected.checkerWarningCount,
  );
  assertEqualField(label, "checkerHintCount", actual.checkerHintCount, expected.checkerHintCount);
  assertEqualField(
    label,
    "checkerTotalFindings",
    actual.checkerTotalFindings,
    expected.checkerTotalFindings,
  );
  assertRecordEqual(label, "byKind", actual.byKind, expected.byKind);
  assertRecordEqual(label, "constrainedKinds", actual.constrainedKinds, expected.constrainedKinds);
  assertRecordEqual(label, "queryKindCounts", actual.queryKindCounts, expected.queryKindCounts);
  assertRecordEqual(
    label,
    "expressionValueDomainKinds",
    actual.expressionValueDomainKinds,
    expected.expressionValueDomainKinds,
  );
  assertRecordEqual(
    label,
    "expressionValueConstraintKinds",
    actual.expressionValueConstraintKinds,
    expected.expressionValueConstraintKinds,
  );
  assertConstraintDetailEqual(
    label,
    "expressionConstraintDetailCounts",
    actual.expressionConstraintDetailCounts,
    expected.expressionConstraintDetailCounts,
  );
  assertRecordEqual(
    label,
    "expressionValueCertaintyShapes",
    actual.expressionValueCertaintyShapes,
    expected.expressionValueCertaintyShapes,
  );
  assertRecordEqual(
    label,
    "expressionSelectorCertaintyShapes",
    actual.expressionSelectorCertaintyShapes,
    expected.expressionSelectorCertaintyShapes,
  );
  assertRecordEqual(
    label,
    "resolutionValueConstraintKinds",
    actual.resolutionValueConstraintKinds,
    expected.resolutionValueConstraintKinds,
  );
  assertConstraintDetailEqual(
    label,
    "resolutionConstraintDetailCounts",
    actual.resolutionConstraintDetailCounts,
    expected.resolutionConstraintDetailCounts,
  );
  assertRecordEqual(
    label,
    "resolutionValueCertaintyShapes",
    actual.resolutionValueCertaintyShapes,
    expected.resolutionValueCertaintyShapes,
  );
  assertRecordEqual(
    label,
    "resolutionSelectorCertaintyShapes",
    actual.resolutionSelectorCertaintyShapes,
    expected.resolutionSelectorCertaintyShapes,
  );
}

export function assertQueryPlanSummaryMatch(
  label: string,
  actual: QueryPlanSummaryV0,
  expected: QueryPlanSummaryV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqualField(label, "totalQueryCount", actual.totalQueryCount, expected.totalQueryCount);
  assertArrayEqual(
    label,
    "expressionSemanticsIds",
    actual.expressionSemanticsIds,
    expected.expressionSemanticsIds,
  );
  assertArrayEqual(
    label,
    "sourceExpressionResolutionIds",
    actual.sourceExpressionResolutionIds,
    expected.sourceExpressionResolutionIds,
  );
  assertArrayEqual(label, "selectorUsageIds", actual.selectorUsageIds, expected.selectorUsageIds);
}

export function assertExpressionDomainPlanSummaryMatch(
  label: string,
  actual: ExpressionDomainPlanSummaryV0,
  expected: ExpressionDomainPlanSummaryV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqualField(label, "finiteValueCount", actual.finiteValueCount, expected.finiteValueCount);
  assertArrayEqual(
    label,
    "plannedExpressionIds",
    actual.plannedExpressionIds,
    expected.plannedExpressionIds,
  );
  assertRecordEqual(label, "valueDomainKinds", actual.valueDomainKinds, expected.valueDomainKinds);
  assertRecordEqual(
    label,
    "valueConstraintKinds",
    actual.valueConstraintKinds,
    expected.valueConstraintKinds,
  );
  assertConstraintDetailEqual(
    label,
    "constraintDetailCounts",
    actual.constraintDetailCounts,
    expected.constraintDetailCounts,
  );
}

export function assertExpressionDomainFragmentsMatch(
  label: string,
  actual: ExpressionDomainFragmentsV0,
  expected: ExpressionDomainFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = stableJson(actual.fragments);
  const expectedJson = stableJson(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expressionDomainFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertExpressionDomainCandidatesMatch(
  label: string,
  actual: ExpressionDomainCandidatesV0,
  expected: ExpressionDomainCandidatesV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = stableJson(actual.candidates);
  const expectedJson = stableJson(expected.candidates);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expressionDomainCandidates mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertExpressionDomainCanonicalCandidateBundleMatch(
  label: string,
  actual: ExpressionDomainCanonicalCandidateBundleV0,
  expected: ExpressionDomainCanonicalCandidateBundleV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertExpressionDomainPlanSummaryMatch(
    `${label}:planSummary`,
    actual.planSummary,
    expected.planSummary,
  );
  if (stableJson(actual.fragments) !== stableJson(expected.fragments)) {
    throw new Error(
      `${label}: expressionDomainCanonicalCandidate fragments mismatch\nactual=${stableJson(actual.fragments)}\nexpected=${stableJson(expected.fragments)}`,
    );
  }
  if (stableJson(actual.candidates) !== stableJson(expected.candidates)) {
    throw new Error(
      `${label}: expressionDomainCanonicalCandidate candidates mismatch\nactual=${stableJson(actual.candidates)}\nexpected=${stableJson(expected.candidates)}`,
    );
  }
}

export function assertExpressionDomainCanonicalProducerSignalMatch(
  label: string,
  actual: ExpressionDomainCanonicalProducerSignalV0,
  expected: ExpressionDomainCanonicalProducerSignalV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertExpressionDomainCanonicalCandidateBundleMatch(
    `${label}:canonicalBundle`,
    actual.canonicalBundle,
    expected.canonicalBundle,
  );
  if (stableJson(actual.evaluatorCandidates) !== stableJson(expected.evaluatorCandidates)) {
    throw new Error(
      `${label}: expressionDomainEvaluatorCandidates mismatch\nactual=${stableJson(actual.evaluatorCandidates)}\nexpected=${stableJson(expected.evaluatorCandidates)}`,
    );
  }
}

export function assertSelectorUsagePlanSummaryMatch(
  label: string,
  actual: SelectorUsagePlanSummaryV0,
  expected: SelectorUsagePlanSummaryV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqualField(
    label,
    "composedSelectorCount",
    actual.composedSelectorCount,
    expected.composedSelectorCount,
  );
  assertEqualField(
    label,
    "totalComposesRefs",
    actual.totalComposesRefs,
    expected.totalComposesRefs,
  );
  assertArrayEqual(
    label,
    "canonicalSelectorNames",
    actual.canonicalSelectorNames,
    expected.canonicalSelectorNames,
  );
  assertRecordEqual(label, "viewKindCounts", actual.viewKindCounts, expected.viewKindCounts);
  assertRecordEqual(
    label,
    "nestedSafetyCounts",
    actual.nestedSafetyCounts,
    expected.nestedSafetyCounts,
  );
}

export function assertSelectorUsageFragmentsMatch(
  label: string,
  actual: SelectorUsageFragmentsV0,
  expected: SelectorUsageFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = JSON.stringify(actual.fragments);
  const expectedJson = JSON.stringify(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: selectorUsageFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertSelectorUsageQueryFragmentsMatch(
  label: string,
  actual: SelectorUsageQueryFragmentsV0,
  expected: SelectorUsageQueryFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = JSON.stringify(actual.fragments);
  const expectedJson = JSON.stringify(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: selectorUsageQueryFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertSourceResolutionPlanSummaryMatch(
  label: string,
  actual: SourceResolutionPlanSummaryV0,
  expected: SourceResolutionPlanSummaryV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqualField(
    label,
    "symbolRefWithBindingCount",
    actual.symbolRefWithBindingCount,
    expected.symbolRefWithBindingCount,
  );
  assertEqualField(label, "styleAccessCount", actual.styleAccessCount, expected.styleAccessCount);
  assertEqualField(
    label,
    "styleAccessPathDepthSum",
    actual.styleAccessPathDepthSum,
    expected.styleAccessPathDepthSum,
  );
  assertArrayEqual(
    label,
    "plannedExpressionIds",
    actual.plannedExpressionIds,
    expected.plannedExpressionIds,
  );
  assertArrayEqual(
    label,
    "distinctStyleFilePaths",
    actual.distinctStyleFilePaths,
    expected.distinctStyleFilePaths,
  );
  assertRecordEqual(
    label,
    "expressionKindCounts",
    actual.expressionKindCounts,
    expected.expressionKindCounts,
  );
}

export function assertSourceResolutionQueryFragmentsMatch(
  label: string,
  actual: SourceResolutionQueryFragmentsV0,
  expected: SourceResolutionQueryFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = JSON.stringify(actual.fragments);
  const expectedJson = JSON.stringify(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: sourceResolutionQueryFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertExpressionSemanticsFragmentsMatch(
  label: string,
  actual: ExpressionSemanticsFragmentsV0,
  expected: ExpressionSemanticsFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = JSON.stringify(actual.fragments);
  const expectedJson = JSON.stringify(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expressionSemanticsFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertExpressionSemanticsQueryFragmentsMatch(
  label: string,
  actual: ExpressionSemanticsQueryFragmentsV0,
  expected: ExpressionSemanticsQueryFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = JSON.stringify(actual.fragments);
  const expectedJson = JSON.stringify(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expressionSemanticsQueryFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertExpressionSemanticsMatchFragmentsMatch(
  label: string,
  actual: ExpressionSemanticsMatchFragmentsV0,
  expected: ExpressionSemanticsMatchFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = JSON.stringify(actual.fragments);
  const expectedJson = JSON.stringify(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expressionSemanticsMatchFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertExpressionSemanticsCandidatesMatch(
  label: string,
  actual: ExpressionSemanticsCandidatesV0,
  expected: ExpressionSemanticsCandidatesV0,
): void {
  if (actual.schemaVersion !== expected.schemaVersion) {
    throw new Error(
      `${label}: expression semantics candidates schema mismatch: ${actual.schemaVersion} !== ${expected.schemaVersion}`,
    );
  }
  if (actual.inputVersion !== expected.inputVersion) {
    throw new Error(
      `${label}: expression semantics candidates input version mismatch: ${actual.inputVersion} !== ${expected.inputVersion}`,
    );
  }
  if (JSON.stringify(actual.candidates) !== JSON.stringify(expected.candidates)) {
    throw new Error(
      `${label}: expression semantics candidates mismatch\nactual=${JSON.stringify(actual.candidates, null, 2)}\nexpected=${JSON.stringify(expected.candidates, null, 2)}`,
    );
  }
}

export function assertExpressionSemanticsCanonicalCandidateBundleMatch(
  label: string,
  actual: ExpressionSemanticsCanonicalCandidateBundleV0,
  expected: ExpressionSemanticsCanonicalCandidateBundleV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  if (JSON.stringify(actual.queryFragments) !== JSON.stringify(expected.queryFragments)) {
    throw new Error(
      `${label}: expression semantics canonical candidate queryFragments mismatch\nactual=${JSON.stringify(actual.queryFragments, null, 2)}\nexpected=${JSON.stringify(expected.queryFragments, null, 2)}`,
    );
  }
  if (JSON.stringify(actual.fragments) !== JSON.stringify(expected.fragments)) {
    throw new Error(
      `${label}: expression semantics canonical candidate fragments mismatch\nactual=${JSON.stringify(actual.fragments, null, 2)}\nexpected=${JSON.stringify(expected.fragments, null, 2)}`,
    );
  }
  if (JSON.stringify(actual.matchFragments) !== JSON.stringify(expected.matchFragments)) {
    throw new Error(
      `${label}: expression semantics canonical candidate matchFragments mismatch\nactual=${JSON.stringify(actual.matchFragments, null, 2)}\nexpected=${JSON.stringify(expected.matchFragments, null, 2)}`,
    );
  }
  if (JSON.stringify(actual.candidates) !== JSON.stringify(expected.candidates)) {
    throw new Error(
      `${label}: expression semantics canonical candidate candidates mismatch\nactual=${JSON.stringify(actual.candidates, null, 2)}\nexpected=${JSON.stringify(expected.candidates, null, 2)}`,
    );
  }
}

export function assertExpressionSemanticsEvaluatorCandidatesMatch(
  label: string,
  actual: ExpressionSemanticsEvaluatorCandidatesV0,
  expected: ExpressionSemanticsEvaluatorCandidatesV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  if (JSON.stringify(actual.results) !== JSON.stringify(expected.results)) {
    throw new Error(
      `${label}: expression semantics evaluator candidates mismatch\nactual=${JSON.stringify(actual.results, null, 2)}\nexpected=${JSON.stringify(expected.results, null, 2)}`,
    );
  }
}

export function assertExpressionSemanticsCanonicalProducerSignalMatch(
  label: string,
  actual: ExpressionSemanticsCanonicalProducerSignalV0,
  expected: ExpressionSemanticsCanonicalProducerSignalV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertExpressionSemanticsCanonicalCandidateBundleMatch(
    `${label}:canonicalBundle`,
    actual.canonicalBundle,
    expected.canonicalBundle,
  );
  assertExpressionSemanticsEvaluatorCandidatesMatch(
    `${label}:evaluatorCandidates`,
    actual.evaluatorCandidates,
    expected.evaluatorCandidates,
  );
}

export function assertSourceResolutionFragmentsMatch(
  label: string,
  actual: SourceResolutionFragmentsV0,
  expected: SourceResolutionFragmentsV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  const actualJson = JSON.stringify(actual.fragments);
  const expectedJson = JSON.stringify(expected.fragments);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: sourceResolutionFragments mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

export function assertSourceResolutionMatchFragmentsMatch(
  label: string,
  actual: SourceResolutionMatchFragmentsV0,
  expected: SourceResolutionMatchFragmentsV0,
): void {
  if (actual.schemaVersion !== expected.schemaVersion) {
    throw new Error(
      `${label}: source resolution match fragment schema mismatch: ${actual.schemaVersion} !== ${expected.schemaVersion}`,
    );
  }
  if (actual.inputVersion !== expected.inputVersion) {
    throw new Error(
      `${label}: source resolution match fragment input version mismatch: ${actual.inputVersion} !== ${expected.inputVersion}`,
    );
  }
  if (JSON.stringify(actual.fragments) !== JSON.stringify(expected.fragments)) {
    throw new Error(
      `${label}: source resolution match fragments mismatch\nactual=${JSON.stringify(actual.fragments, null, 2)}\nexpected=${JSON.stringify(expected.fragments, null, 2)}`,
    );
  }
}

export function assertSourceResolutionCandidatesMatch(
  label: string,
  actual: SourceResolutionCandidatesV0,
  expected: SourceResolutionCandidatesV0,
): void {
  if (actual.schemaVersion !== expected.schemaVersion) {
    throw new Error(
      `${label}: source resolution candidates schema mismatch: ${actual.schemaVersion} !== ${expected.schemaVersion}`,
    );
  }
  if (actual.inputVersion !== expected.inputVersion) {
    throw new Error(
      `${label}: source resolution candidates input version mismatch: ${actual.inputVersion} !== ${expected.inputVersion}`,
    );
  }
  if (JSON.stringify(actual.candidates) !== JSON.stringify(expected.candidates)) {
    throw new Error(
      `${label}: source resolution candidates mismatch\nactual=${JSON.stringify(actual.candidates, null, 2)}\nexpected=${JSON.stringify(expected.candidates, null, 2)}`,
    );
  }
}

export function assertSourceResolutionEvaluatorCandidatesMatch(
  label: string,
  actual: SourceResolutionEvaluatorCandidatesV0,
  expected: SourceResolutionEvaluatorCandidatesV0,
): void {
  if (actual.schemaVersion !== expected.schemaVersion) {
    throw new Error(
      `${label}: source resolution evaluator candidates schema mismatch: ${actual.schemaVersion} !== ${expected.schemaVersion}`,
    );
  }
  if (actual.inputVersion !== expected.inputVersion) {
    throw new Error(
      `${label}: source resolution evaluator candidates input version mismatch: ${actual.inputVersion} !== ${expected.inputVersion}`,
    );
  }
  if (JSON.stringify(actual.results) !== JSON.stringify(expected.results)) {
    throw new Error(
      `${label}: source resolution evaluator candidates mismatch\nactual=${JSON.stringify(actual.results, null, 2)}\nexpected=${JSON.stringify(expected.results, null, 2)}`,
    );
  }
}

export function assertSourceResolutionCanonicalCandidateBundleMatch(
  label: string,
  actual: SourceResolutionCanonicalCandidateBundleV0,
  expected: SourceResolutionCanonicalCandidateBundleV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  if (JSON.stringify(actual.queryFragments) !== JSON.stringify(expected.queryFragments)) {
    throw new Error(
      `${label}: source resolution canonical candidate queryFragments mismatch\nactual=${JSON.stringify(actual.queryFragments, null, 2)}\nexpected=${JSON.stringify(expected.queryFragments, null, 2)}`,
    );
  }
  if (JSON.stringify(actual.fragments) !== JSON.stringify(expected.fragments)) {
    throw new Error(
      `${label}: source resolution canonical candidate fragments mismatch\nactual=${JSON.stringify(actual.fragments, null, 2)}\nexpected=${JSON.stringify(expected.fragments, null, 2)}`,
    );
  }
  if (JSON.stringify(actual.matchFragments) !== JSON.stringify(expected.matchFragments)) {
    throw new Error(
      `${label}: source resolution canonical candidate matchFragments mismatch\nactual=${JSON.stringify(actual.matchFragments, null, 2)}\nexpected=${JSON.stringify(expected.matchFragments, null, 2)}`,
    );
  }
  if (JSON.stringify(actual.candidates) !== JSON.stringify(expected.candidates)) {
    throw new Error(
      `${label}: source resolution canonical candidate candidates mismatch\nactual=${JSON.stringify(actual.candidates, null, 2)}\nexpected=${JSON.stringify(expected.candidates, null, 2)}`,
    );
  }
}

export function assertSourceResolutionCanonicalProducerSignalMatch(
  label: string,
  actual: SourceResolutionCanonicalProducerSignalV0,
  expected: SourceResolutionCanonicalProducerSignalV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertSourceResolutionCanonicalCandidateBundleMatch(
    `${label}:canonicalBundle`,
    actual.canonicalBundle,
    expected.canonicalBundle,
  );
  assertSourceResolutionEvaluatorCandidatesMatch(
    `${label}:evaluatorCandidates`,
    actual.evaluatorCandidates,
    expected.evaluatorCandidates,
  );
}

export function assertSourceSideCanonicalCandidateBundleMatch(
  label: string,
  actual: SourceSideCanonicalCandidateBundleV0,
  expected: SourceSideCanonicalCandidateBundleV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertExpressionSemanticsCanonicalCandidateBundleMatch(
    `${label}:expressionSemantics`,
    actual.expressionSemantics,
    expected.expressionSemantics,
  );
  assertSourceResolutionCanonicalCandidateBundleMatch(
    `${label}:sourceResolution`,
    actual.sourceResolution,
    expected.sourceResolution,
  );
}

export function assertSourceSideEvaluatorCandidatesMatch(
  label: string,
  actual: SourceSideEvaluatorCandidatesV0,
  expected: SourceSideEvaluatorCandidatesV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertExpressionSemanticsEvaluatorCandidatesMatch(
    `${label}:expressionSemantics`,
    actual.expressionSemantics,
    expected.expressionSemantics,
  );
  assertSourceResolutionEvaluatorCandidatesMatch(
    `${label}:sourceResolution`,
    actual.sourceResolution,
    expected.sourceResolution,
  );
}

export function assertSourceSideCanonicalProducerSignalMatch(
  label: string,
  actual: SourceSideCanonicalProducerSignalV0,
  expected: SourceSideCanonicalProducerSignalV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertSourceSideCanonicalCandidateBundleMatch(
    `${label}:canonicalBundle`,
    actual.canonicalBundle,
    expected.canonicalBundle,
  );
  assertSourceSideEvaluatorCandidatesMatch(
    `${label}:evaluatorCandidates`,
    actual.evaluatorCandidates,
    expected.evaluatorCandidates,
  );
}

export function assertSemanticCanonicalCandidateBundleMatch(
  label: string,
  actual: SemanticCanonicalCandidateBundleV0,
  expected: SemanticCanonicalCandidateBundleV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertSourceSideCanonicalCandidateBundleMatch(
    `${label}:sourceSide`,
    actual.sourceSide,
    expected.sourceSide,
  );
  assertExpressionDomainCanonicalCandidateBundleMatch(
    `${label}:expressionDomain`,
    actual.expressionDomain,
    expected.expressionDomain,
  );
}

export function assertSemanticEvaluatorCandidatesMatch(
  label: string,
  actual: SemanticEvaluatorCandidatesV0,
  expected: SemanticEvaluatorCandidatesV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertSourceSideEvaluatorCandidatesMatch(
    `${label}:sourceSide`,
    actual.sourceSide,
    expected.sourceSide,
  );
  if (stableJson(actual.expressionDomain) !== stableJson(expected.expressionDomain)) {
    throw new Error(
      `${label}: semanticExpressionDomainEvaluatorCandidates mismatch\nactual=${stableJson(actual.expressionDomain)}\nexpected=${stableJson(expected.expressionDomain)}`,
    );
  }
}

export function assertSemanticCanonicalProducerSignalMatch(
  label: string,
  actual: SemanticCanonicalProducerSignalV0,
  expected: SemanticCanonicalProducerSignalV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertSemanticCanonicalCandidateBundleMatch(
    `${label}:canonicalBundle`,
    actual.canonicalBundle,
    expected.canonicalBundle,
  );
  assertSemanticEvaluatorCandidatesMatch(
    `${label}:evaluatorCandidates`,
    actual.evaluatorCandidates,
    expected.evaluatorCandidates,
  );
}

function assertEqualField<T>(label: string, field: string, actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${JSON.stringify(expected)}\nreceived: ${JSON.stringify(actual)}`,
    );
  }
}

function assertArrayEqual(
  label: string,
  field: string,
  actual: readonly string[],
  expected: readonly string[],
) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

function assertRecordEqual(
  label: string,
  field: string,
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
) {
  const actualJson = JSON.stringify(sortRecord(actual));
  const expectedJson = JSON.stringify(sortRecord(expected));
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

function sortRecord(record: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}

function collectQueryPayloadSummary(
  query: QueryResultV2,
  expressionValueDomainKinds: Record<string, number>,
  expressionValueConstraintKinds: Record<string, number>,
  expressionConstraintDetailCounts: ConstraintDetailCounts,
  expressionValueCertaintyShapes: Record<string, number>,
  expressionSelectorCertaintyShapes: Record<string, number>,
  resolutionValueConstraintKinds: Record<string, number>,
  resolutionConstraintDetailCounts: ConstraintDetailCounts,
  resolutionValueCertaintyShapes: Record<string, number>,
  resolutionSelectorCertaintyShapes: Record<string, number>,
  expressionSemanticsIds: Set<string>,
  resolutionIds: Set<string>,
  selectorUsageIds: Set<string>,
  onSelectorUsage: (payload: SelectorUsagePayloadSummary) => void,
) {
  switch (query.kind) {
    case "expression-semantics":
      expressionSemanticsIds.add(query.queryId);
      increment(expressionValueDomainKinds, query.payload.valueDomainKind);
      if (query.payload.valueConstraintKind) {
        increment(expressionValueConstraintKinds, query.payload.valueConstraintKind);
      }
      collectConstraintDetailCounts(
        expressionConstraintDetailCounts,
        query.payload.valuePrefix,
        query.payload.valueSuffix,
        query.payload.valueMinLen,
        query.payload.valueMaxLen,
        query.payload.valueCharMust,
        query.payload.valueCharMay,
        query.payload.valueMayIncludeOtherChars === true,
      );
      if (query.payload.valueCertaintyShapeKind) {
        increment(expressionValueCertaintyShapes, query.payload.valueCertaintyShapeKind);
      }
      if (query.payload.selectorCertaintyShapeKind) {
        increment(expressionSelectorCertaintyShapes, query.payload.selectorCertaintyShapeKind);
      }
      break;
    case "source-expression-resolution":
      resolutionIds.add(query.queryId);
      if (query.payload.valueCertaintyConstraintKind) {
        increment(resolutionValueConstraintKinds, query.payload.valueCertaintyConstraintKind);
      }
      collectConstraintDetailCounts(
        resolutionConstraintDetailCounts,
        query.payload.valuePrefix,
        query.payload.valueSuffix,
        query.payload.valueMinLen,
        query.payload.valueMaxLen,
        query.payload.valueCharMust,
        query.payload.valueCharMay,
        query.payload.valueMayIncludeOtherChars === true,
      );
      if (query.payload.valueCertaintyShapeKind) {
        increment(resolutionValueCertaintyShapes, query.payload.valueCertaintyShapeKind);
      }
      if (query.payload.selectorCertaintyShapeKind) {
        increment(resolutionSelectorCertaintyShapes, query.payload.selectorCertaintyShapeKind);
      }
      break;
    case "selector-usage":
      selectorUsageIds.add(query.queryId);
      onSelectorUsage(query.payload);
      break;
  }
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

interface SelectorUsagePayloadSummary {
  readonly totalReferences: number;
  readonly directReferenceCount: number;
  readonly editableDirectReferenceCount: number;
  readonly exactReferenceCount: number;
  readonly inferredOrBetterReferenceCount: number;
  readonly hasExpandedReferences: boolean;
  readonly hasStyleDependencyReferences: boolean;
  readonly hasAnyReferences: boolean;
}

interface ConstraintDetailCounts {
  prefixCount: number;
  suffixCount: number;
  minLenCount: number;
  minLenSum: number;
  maxLenCount: number;
  maxLenSum: number;
  charMustCount: number;
  charMustLenSum: number;
  charMayCount: number;
  charMayLenSum: number;
  mayIncludeOtherCharsCount: number;
}

function createConstraintDetailCounts(): ConstraintDetailCounts {
  return {
    prefixCount: 0,
    suffixCount: 0,
    minLenCount: 0,
    minLenSum: 0,
    maxLenCount: 0,
    maxLenSum: 0,
    charMustCount: 0,
    charMustLenSum: 0,
    charMayCount: 0,
    charMayLenSum: 0,
    mayIncludeOtherCharsCount: 0,
  };
}

function collectConstraintDetailCounts(
  counts: ConstraintDetailCounts,
  prefix: string | undefined,
  suffix: string | undefined,
  minLen: number | undefined,
  maxLen: number | undefined,
  charMust: string | undefined,
  charMay: string | undefined,
  mayIncludeOtherChars: boolean,
) {
  if (prefix !== undefined) counts.prefixCount += 1;
  if (suffix !== undefined) counts.suffixCount += 1;
  if (minLen !== undefined) {
    counts.minLenCount += 1;
    counts.minLenSum += minLen;
  }
  if (maxLen !== undefined) {
    counts.maxLenCount += 1;
    counts.maxLenSum += maxLen;
  }
  if (charMust !== undefined) {
    counts.charMustCount += 1;
    counts.charMustLenSum += charMust.length;
  }
  if (charMay !== undefined) {
    counts.charMayCount += 1;
    counts.charMayLenSum += charMay.length;
  }
  if (mayIncludeOtherChars) {
    counts.mayIncludeOtherCharsCount += 1;
  }
}

function assertConstraintDetailEqual(
  label: string,
  field: string,
  actual: ConstraintDetailCounts,
  expected: ConstraintDetailCounts,
) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}
