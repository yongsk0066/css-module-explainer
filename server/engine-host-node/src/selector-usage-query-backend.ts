import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { buildEngineInputV2 } from "./engine-input-v2";
import {
  collectSourceDocuments,
  resolveWorkspaceCheckFilesSync,
} from "./checker-host/workspace-check-support";
import { runRustSelectedQueryBackendJson } from "./selected-query-backend";
import type { BuildSelectedQueryResultsV2Options } from "./engine-query-v2";

type SelectorUsageQueryBackendOptions = Pick<
  BuildSelectedQueryResultsV2Options,
  | "workspaceRoot"
  | "classnameTransform"
  | "pathAlias"
  | "sourceDocuments"
  | "styleFiles"
  | "analysisCache"
  | "styleDocumentForPath"
  | "typeResolver"
>;

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

export interface SelectorUsageRenderSummary {
  readonly totalReferences: number;
  readonly directReferenceCount: number;
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
  options: SelectorUsageQueryBackendOptions,
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

export function resolveRustSelectorUsagePayloadForWorkspaceTarget(
  args: {
    readonly workspaceRoot: string;
    readonly classnameTransform: BuildSelectedQueryResultsV2Options["classnameTransform"];
    readonly pathAlias: BuildSelectedQueryResultsV2Options["pathAlias"];
  },
  deps: Pick<ProviderDeps, "analysisCache" | "styleDocumentForPath" | "typeResolver">,
  filePath: string,
  canonicalName: string,
): SelectorUsageEvaluatorCandidatePayloadV0 | null {
  const { sourceFiles, styleFiles } = resolveWorkspaceCheckFilesSync({
    workspaceRoot: args.workspaceRoot,
  });
  const sourceDocuments = collectSourceDocuments(sourceFiles, deps.analysisCache);
  return resolveRustSelectorUsagePayload(
    {
      workspaceRoot: args.workspaceRoot,
      classnameTransform: args.classnameTransform,
      pathAlias: args.pathAlias,
      sourceDocuments,
      styleFiles,
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
    },
    filePath,
    canonicalName,
  );
}

export function buildSelectorUsageRenderSummaryFromRustPayload(
  payload: SelectorUsageEvaluatorCandidatePayloadV0,
): SelectorUsageRenderSummary {
  return {
    totalReferences: payload.totalReferences,
    directReferenceCount: payload.directReferenceCount,
    hasExpandedReferences: payload.hasExpandedReferences,
    hasStyleDependencyReferences: payload.hasStyleDependencyReferences,
    hasAnyReferences: payload.hasAnyReferences,
  };
}
