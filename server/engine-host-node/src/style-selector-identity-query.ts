import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveSelectedQueryBackendKind,
  usesRustStyleSemanticGraphBackend,
} from "./selected-query-backend";
import {
  buildStyleSemanticGraphSelectorIdentityReadModels,
  resolveRustStyleSemanticGraphForWorkspaceTarget,
  type StyleSemanticGraphSelectorIdentityReadModel,
} from "./style-semantic-graph-query-backend";

export interface StyleSelectorIdentityQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustStyleSemanticGraphForWorkspaceTarget?: typeof resolveRustStyleSemanticGraphForWorkspaceTarget;
}

type StyleSelectorIdentityDeps = Pick<
  ProviderDeps,
  | "analysisCache"
  | "settings"
  | "styleDocumentForPath"
  | "typeResolver"
  | "workspaceRoot"
  | "readStyleFile"
>;

export function resolveRustStyleSelectorIdentityReadModelForWorkspaceTarget(
  args: {
    readonly filePath: string;
    readonly styleDocument: StyleDocumentHIR;
    readonly canonicalName: string;
  },
  deps: StyleSelectorIdentityDeps,
  options: StyleSelectorIdentityQueryOptions = {},
): StyleSemanticGraphSelectorIdentityReadModel | null {
  if (!usesRustStyleSemanticGraphBackend(resolveSelectedQueryBackendKind(options.env))) {
    return null;
  }

  const graph = safeResolveRustStyleSemanticGraphForWorkspaceTarget(args.filePath, deps, options);
  if (!graph) return null;

  return (
    buildStyleSemanticGraphSelectorIdentityReadModels(graph, args.styleDocument).find(
      (identity) => identity.canonicalName === args.canonicalName,
    ) ?? null
  );
}

function safeResolveRustStyleSemanticGraphForWorkspaceTarget(
  filePath: string,
  deps: StyleSelectorIdentityDeps,
  options: StyleSelectorIdentityQueryOptions,
) {
  try {
    return (
      options.readRustStyleSemanticGraphForWorkspaceTarget ??
      resolveRustStyleSemanticGraphForWorkspaceTarget
    )(
      {
        workspaceRoot: deps.workspaceRoot,
        classnameTransform: deps.settings.scss.classnameTransform,
        pathAlias: deps.settings.pathAlias,
      },
      deps,
      filePath,
    );
  } catch {
    return null;
  }
}
