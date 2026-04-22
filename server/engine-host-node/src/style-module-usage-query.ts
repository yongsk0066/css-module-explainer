import {
  listCanonicalSelectors,
  readStyleModuleUsageSummary,
} from "../../engine-core-ts/src/core/query";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { resolveSelectedQueryBackendKind } from "./selected-query-backend";
import { resolveRustSelectorUsagePayloadForWorkspaceTarget } from "./selector-usage-query-backend";

export interface StyleModuleUsageSelectorSummary {
  readonly canonicalName: string;
  readonly range: StyleDocumentHIR["selectors"][number]["range"];
}

export interface StyleModuleUsageQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export function resolveUnusedStyleSelectors(
  args: {
    readonly scssPath: string;
    readonly styleDocument: StyleDocumentHIR;
  },
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "settings"
  >,
  options: StyleModuleUsageQueryOptions = {},
): readonly StyleModuleUsageSelectorSummary[] {
  const fallback = readStyleModuleUsageSummary(
    args.scssPath,
    args.styleDocument,
    deps.semanticReferenceIndex,
    deps.styleDependencyGraph,
  );
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  if (selectedQueryBackend !== "rust-selector-usage") {
    return fallback.unusedSelectors;
  }

  const hasUnresolvedDynamicUsage = deps.semanticReferenceIndex
    .findModuleUsages(args.scssPath)
    .some((usage) => usage.isDynamic && !usage.hasResolvedTargets);
  if (hasUnresolvedDynamicUsage) {
    return [];
  }

  const readRustPayload =
    options.readRustSelectorUsagePayloadForWorkspaceTarget ??
    resolveRustSelectorUsagePayloadForWorkspaceTarget;
  const unused: StyleModuleUsageSelectorSummary[] = [];

  for (const selector of listCanonicalSelectors(args.styleDocument)) {
    const payload = readRustPayload(
      {
        workspaceRoot: deps.workspaceRoot,
        classnameTransform: deps.settings.scss.classnameTransform,
        pathAlias: deps.settings.pathAlias,
      },
      deps,
      args.scssPath,
      selector.canonicalName,
    );
    if (!payload) {
      return fallback.unusedSelectors;
    }
    if (!payload.hasAnyReferences) {
      unused.push({
        canonicalName: selector.canonicalName,
        range: selector.range,
      });
    }
  }

  return unused;
}
