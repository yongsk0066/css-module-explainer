import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import type { EdgeCertainty } from "../../engine-core-ts/src/core/semantic/certainty";
import {
  buildSelectedQueryBackendInput,
  runRustSelectedQueryBackendJson,
  type SelectedQueryBackendDocument,
} from "./selected-query-backend";

export interface ExpressionSemanticsEvaluatorCandidatePayloadV0 {
  readonly expressionId: string;
  readonly expressionKind: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly candidateNames: readonly string[];
  readonly finiteValues?: readonly string[];
  readonly valueDomainKind: string;
  readonly selectorCertainty: EdgeCertainty;
  readonly valueCertainty?: EdgeCertainty;
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

interface ExpressionSemanticsEvaluatorCandidateV0 {
  readonly kind: "expression-semantics";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: ExpressionSemanticsEvaluatorCandidatePayloadV0;
}

interface ExpressionSemanticsCanonicalProducerSignalV0 {
  readonly evaluatorCandidates: {
    readonly results: readonly ExpressionSemanticsEvaluatorCandidateV0[];
  };
}

export function resolveRustExpressionSemanticsPayload(
  document: SelectedQueryBackendDocument,
  expressionId: string,
  scssModulePath: string,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
): ExpressionSemanticsEvaluatorCandidatePayloadV0 | null {
  const input = buildSelectedQueryBackendInput(document, scssModulePath, deps);
  const signal = runRustSelectedQueryBackendJson<ExpressionSemanticsCanonicalProducerSignalV0>(
    "input-expression-semantics-canonical-producer",
    input,
  );
  const match = signal.evaluatorCandidates.results.find(
    (candidate) => candidate.queryId === expressionId,
  );
  return match?.payload ?? null;
}
