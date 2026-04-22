import { buildEngineInputV2 } from "./engine-input-v2";
import { runRustSelectedQueryBackendJson } from "./selected-query-backend";
import type { BuildSelectedQueryResultsV2Options } from "./engine-query-v2";

export interface SelectorUsageEvaluatorCandidatePayloadV0 {
  readonly canonicalName: string;
  readonly totalReferences: number;
  readonly directReferenceCount: number;
  readonly editableDirectReferenceCount: number;
  readonly exactReferenceCount: number;
  readonly inferredOrBetterReferenceCount: number;
  readonly hasExpandedReferences: boolean;
  readonly hasStyleDependencyReferences: boolean;
  readonly hasAnyReferences: boolean;
}

interface SelectorUsageEvaluatorCandidateV0 {
  readonly kind: "selector-usage";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: SelectorUsageEvaluatorCandidatePayloadV0;
}

interface SelectorUsageCanonicalProducerSignalV0 {
  readonly evaluatorCandidates: {
    readonly results: readonly SelectorUsageEvaluatorCandidateV0[];
  };
}

export function resolveRustSelectorUsagePayload(
  options: BuildSelectedQueryResultsV2Options,
  filePath: string,
  canonicalName: string,
): SelectorUsageEvaluatorCandidatePayloadV0 | null {
  const input = buildEngineInputV2({
    workspaceRoot: options.workspaceRoot,
    classnameTransform: options.classnameTransform,
    pathAlias: options.pathAlias,
    sourceDocuments: options.sourceDocuments,
    styleFiles: options.styleFiles,
    analysisCache: options.analysisCache,
    styleDocumentForPath: options.styleDocumentForPath,
    typeResolver: options.typeResolver,
  });
  const signal = runRustSelectedQueryBackendJson<SelectorUsageCanonicalProducerSignalV0>(
    "input-selector-usage-canonical-producer",
    input,
  );
  const match = signal.evaluatorCandidates.results.find(
    (candidate) => candidate.filePath === filePath && candidate.queryId === canonicalName,
  );
  return match?.payload ?? null;
}
