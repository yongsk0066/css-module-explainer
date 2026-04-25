import {
  listCanonicalSelectors,
  readStyleModuleUsageSummary,
} from "../../engine-core-ts/src/core/query";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveSelectedQueryBackendKind,
  usesRustSelectorUsageBackend,
} from "./selected-query-backend";
import { resolveRustSelectorUsagePayloadForWorkspaceTarget } from "./selector-usage-query-backend";
import {
  resolveRustStyleSelectorReferenceSummariesForWorkspaceTarget,
  type StyleSelectorReferenceQueryOptions,
} from "./style-selector-reference-query";

export interface StyleModuleUsageSelectorSummary {
  readonly canonicalName: string;
  readonly range: StyleDocumentHIR["selectors"][number]["range"];
}

export interface StyleModuleUsageQueryOptions extends StyleSelectorReferenceQueryOptions {
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
  > & { readonly readStyleFile?: ProviderDeps["readStyleFile"] },
  options: StyleModuleUsageQueryOptions = {},
): readonly StyleModuleUsageSelectorSummary[] {
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  if (!usesRustSelectorUsageBackend(selectedQueryBackend)) {
    return readCurrentUnusedStyleSelectors(args, deps);
  }

  const hasUnresolvedDynamicUsage = deps.semanticReferenceIndex
    .findModuleUsages(args.scssPath)
    .some((usage) => usage.isDynamic && !usage.hasResolvedTargets);
  if (hasUnresolvedDynamicUsage) {
    return [];
  }

  const graphUnused = resolveGraphUnusedStyleSelectors(args, deps, options);
  if (graphUnused) return graphUnused;

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
      return readCurrentUnusedStyleSelectors(args, deps);
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

function resolveGraphUnusedStyleSelectors(
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
  > & { readonly readStyleFile?: ProviderDeps["readStyleFile"] },
  options: StyleModuleUsageQueryOptions,
): readonly StyleModuleUsageSelectorSummary[] | null {
  if (!deps.readStyleFile) return null;
  const graphSelectors = resolveRustStyleSelectorReferenceSummariesForWorkspaceTarget(
    { filePath: args.scssPath },
    { ...deps, readStyleFile: deps.readStyleFile },
    options,
  );
  if (!graphSelectors) return null;

  const referenceSummaryByName = new Map(
    graphSelectors.map((selector) => [selector.localName, selector] as const),
  );
  const unused: StyleModuleUsageSelectorSummary[] = [];

  for (const selector of listCanonicalSelectors(args.styleDocument)) {
    const referenceSummary = referenceSummaryByName.get(selector.canonicalName);
    if (!referenceSummary) return null;
    if (!referenceSummary.hasAnyReferences) {
      unused.push({
        canonicalName: selector.canonicalName,
        range: selector.range,
      });
    }
  }

  return unused;
}

function readCurrentUnusedStyleSelectors(
  args: {
    readonly scssPath: string;
    readonly styleDocument: StyleDocumentHIR;
  },
  deps: Pick<ProviderDeps, "semanticReferenceIndex" | "styleDependencyGraph">,
): readonly StyleModuleUsageSelectorSummary[] {
  return readStyleModuleUsageSummary(
    args.scssPath,
    args.styleDocument,
    deps.semanticReferenceIndex,
    deps.styleDependencyGraph,
  ).unusedSelectors;
}
