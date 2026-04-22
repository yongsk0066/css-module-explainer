import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  buildSelectedQueryBackendInput,
  resolveSelectedQueryBackendKind,
  runRustSelectedQueryBackendJson,
  type SelectedQueryBackendDocument,
} from "./selected-query-backend";

export interface SourceResolutionSelectorMatch {
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
}

interface SourceResolutionEvaluatorCandidateV0 {
  readonly kind: "source-expression-resolution";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: {
    readonly expressionId: string;
    readonly styleFilePath: string;
    readonly selectorNames: readonly string[];
  };
}

interface SourceResolutionCanonicalProducerSignalV0 {
  readonly evaluatorCandidates: {
    readonly results: readonly SourceResolutionEvaluatorCandidateV0[];
  };
}

export function resolveRustSourceResolutionSelectorMatch(
  document: SelectedQueryBackendDocument,
  expressionId: string,
  scssModulePath: string,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
): SourceResolutionSelectorMatch | null {
  const input = buildSelectedQueryBackendInput(document, scssModulePath, deps);
  const signal = runRustSelectedQueryBackendJson<SourceResolutionCanonicalProducerSignalV0>(
    "input-source-resolution-canonical-producer",
    input,
  );
  const match = signal.evaluatorCandidates.results.find(
    (candidate) => candidate.queryId === expressionId,
  );
  if (!match || !match.payload.styleFilePath) return null;

  return {
    styleFilePath: match.payload.styleFilePath,
    selectorNames: match.payload.selectorNames,
  };
}

export { resolveSelectedQueryBackendKind };
