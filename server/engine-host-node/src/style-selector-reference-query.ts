import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveSelectedQueryBackendKind,
  usesRustStyleSemanticGraphBackend,
} from "./selected-query-backend";
import {
  resolveRustStyleSemanticGraphForWorkspaceTarget,
  type StyleSemanticGraphSelectorReferenceSummaryV0,
} from "./style-semantic-graph-query-backend";
import type { SelectorUsageRenderSummary } from "./selector-usage-query-backend";

export interface StyleSelectorReferenceQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustStyleSemanticGraphForWorkspaceTarget?: typeof resolveRustStyleSemanticGraphForWorkspaceTarget;
}

type StyleSelectorReferenceDeps = Pick<
  ProviderDeps,
  | "analysisCache"
  | "settings"
  | "styleDocumentForPath"
  | "typeResolver"
  | "workspaceRoot"
  | "readStyleFile"
>;

export function resolveRustStyleSelectorReferenceSummaryForWorkspaceTarget(
  args: {
    readonly filePath: string;
    readonly canonicalName: string;
  },
  deps: StyleSelectorReferenceDeps,
  options: StyleSelectorReferenceQueryOptions = {},
): StyleSemanticGraphSelectorReferenceSummaryV0 | null {
  if (!usesRustStyleSemanticGraphBackend(resolveSelectedQueryBackendKind(options.env))) {
    return null;
  }

  const graph = (
    options.readRustStyleSemanticGraphForWorkspaceTarget ??
    resolveRustStyleSemanticGraphForWorkspaceTarget
  )(
    {
      workspaceRoot: deps.workspaceRoot,
      classnameTransform: deps.settings.scss.classnameTransform,
      pathAlias: deps.settings.pathAlias,
    },
    deps,
    args.filePath,
  );
  if (!graph) return null;

  return (
    graph.selectorReferenceEngine.selectors.find(
      (selector) => selector.localName === args.canonicalName,
    ) ?? null
  );
}

export function buildSelectorReferenceRenderSummaryFromRustGraph(
  selector: StyleSemanticGraphSelectorReferenceSummaryV0,
): SelectorUsageRenderSummary {
  return {
    totalReferences: selector.totalReferences,
    directReferenceCount: selector.directReferenceCount,
    hasExpandedReferences: selector.hasExpandedReferences,
    hasStyleDependencyReferences: selector.hasStyleDependencyReferences,
    hasAnyReferences: selector.hasAnyReferences,
  };
}
