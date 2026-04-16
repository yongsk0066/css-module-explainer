import type { TextRewritePlan } from "../core/rewrite/text-rewrite-plan";
import type { ClassnameTransformMode } from "../core/scss/classname-transform";
import type { SourceDocumentHIR } from "../core/hir/source-types";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import type { CheckerReportV1 } from "./checker-v1";

export const ENGINE_CONTRACT_VERSION_V1 = "1" as const;

export interface EngineWorkspaceV1 {
  readonly root: string;
  readonly classnameTransform: ClassnameTransformMode;
  readonly settingsKey: string;
}

export interface SourceBindingGraphSnapshotDeclarationV1 {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
}

export interface SourceBindingGraphSnapshotResolutionV1 {
  readonly expressionId: string;
  readonly declarationId: string | null;
}

export interface SourceBindingGraphSnapshotV1 {
  readonly declarations: readonly SourceBindingGraphSnapshotDeclarationV1[];
  readonly resolutions: readonly SourceBindingGraphSnapshotResolutionV1[];
}

export interface SourceAnalysisInputV1 {
  readonly filePath: string;
  readonly document: SourceDocumentHIR;
  readonly bindingGraph: SourceBindingGraphSnapshotV1;
}

export interface StyleAnalysisInputV1 {
  readonly filePath: string;
  readonly document: StyleDocumentHIR;
}

export type StringTypeFactKindV1 = "unknown" | "exact" | "finiteSet" | "prefix" | "top";

export interface StringTypeFactsV1 {
  readonly kind: StringTypeFactKindV1;
  readonly values?: readonly string[];
  readonly prefix?: string;
}

export interface TypeFactTableEntryV1 {
  readonly filePath: string;
  readonly expressionId: string;
  readonly facts: StringTypeFactsV1;
}

export type TypeFactTableV1 = readonly TypeFactTableEntryV1[];

export type QueryResultKindV1 =
  | "expression-semantics"
  | "selector-usage"
  | "source-expression-resolution";

export interface ExpressionSemanticsQueryResultV1 {
  readonly kind: "expression-semantics";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: {
    readonly expressionId: string;
    readonly expressionKind: string;
    readonly styleFilePath: string | null;
    readonly selectorNames: readonly string[];
    readonly candidateNames: readonly string[];
    readonly finiteValues: readonly string[] | null;
    readonly valueDomainKind: string;
    readonly selectorCertainty: string;
    readonly valueCertainty?: string;
    readonly reason?: string;
  };
}

export interface SourceExpressionResolutionQueryResultV1 {
  readonly kind: "source-expression-resolution";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: {
    readonly expressionId: string;
    readonly styleFilePath: string | null;
    readonly selectorNames: readonly string[];
    readonly finiteValues: readonly string[] | null;
    readonly selectorCertainty: string;
    readonly valueCertainty?: string;
    readonly reason?: string;
  };
}

export interface SelectorUsageQueryResultV1 {
  readonly kind: "selector-usage";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: {
    readonly canonicalName: string;
    readonly totalReferences: number;
    readonly directReferenceCount: number;
    readonly editableDirectReferenceCount: number;
    readonly exactReferenceCount: number;
    readonly inferredOrBetterReferenceCount: number;
    readonly hasExpandedReferences: boolean;
    readonly hasStyleDependencyReferences: boolean;
    readonly hasAnyReferences: boolean;
  };
}

export type QueryResultV1 =
  | ExpressionSemanticsQueryResultV1
  | SourceExpressionResolutionQueryResultV1
  | SelectorUsageQueryResultV1;

export interface EngineInputV1 {
  readonly version: typeof ENGINE_CONTRACT_VERSION_V1;
  readonly workspace: EngineWorkspaceV1;
  readonly sources: readonly SourceAnalysisInputV1[];
  readonly styles: readonly StyleAnalysisInputV1[];
  readonly typeFacts: readonly TypeFactTableEntryV1[];
}

export interface EngineOutputV1 {
  readonly version: typeof ENGINE_CONTRACT_VERSION_V1;
  readonly queryResults: readonly QueryResultV1[];
  readonly rewritePlans: readonly TextRewritePlan<unknown>[];
  readonly checkerReport: CheckerReportV1;
}
