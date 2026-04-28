import {
  listCanonicalSelectors,
  readStyleModuleUsageSummary,
} from "../../engine-core-ts/src/core/query";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveSelectedQueryBackendKind,
  usesRustStyleSemanticGraphBackend,
  usesRustSelectorUsageBackend,
} from "./selected-query-backend";
import {
  resolveRustSelectorUsagePayloadForWorkspaceTargetAsync,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
  resolveRustSelectorUsagePayloadsForWorkspaceTargetAsync,
  resolveRustSelectorUsagePayloadsForWorkspaceTarget,
  type SelectorUsageEvaluatorCandidatePayloadV0,
  type SelectorUsagePayloadCache,
} from "./selector-usage-query-backend";
import {
  resolveRustStyleSelectorReferenceSummariesForWorkspaceTargetAsync,
  resolveRustStyleSelectorReferenceSummariesForWorkspaceTarget,
  type StyleSelectorReferenceQueryOptions,
} from "./style-selector-reference-query";
import type { StyleSemanticGraphCache } from "./style-semantic-graph-query-backend";

export interface StyleModuleUsageSelectorSummary {
  readonly canonicalName: string;
  readonly range: StyleDocumentHIR["selectors"][number]["range"];
}

export interface StyleModuleUsageQueryOptions extends StyleSelectorReferenceQueryOptions {
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
  readonly readRustSelectorUsagePayloadsForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadsForWorkspaceTarget;
  readonly readRustSelectorUsagePayloadForWorkspaceTargetAsync?: typeof resolveRustSelectorUsagePayloadForWorkspaceTargetAsync;
  readonly readRustSelectorUsagePayloadsForWorkspaceTargetAsync?: typeof resolveRustSelectorUsagePayloadsForWorkspaceTargetAsync;
  readonly selectorUsagePayloadCache?: SelectorUsagePayloadCache;
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
  > & {
    readonly readStyleFile?: ProviderDeps["readStyleFile"];
    readonly styleSemanticGraphCache?: StyleSemanticGraphCache;
  },
  options: StyleModuleUsageQueryOptions = {},
): readonly StyleModuleUsageSelectorSummary[] {
  const depsSelectorUsageCache = (
    deps as {
      readonly selectorUsagePayloadCache?: SelectorUsagePayloadCache;
    }
  ).selectorUsagePayloadCache;
  const queryOptions =
    options.selectorUsagePayloadCache || !depsSelectorUsageCache
      ? options
      : {
          ...options,
          selectorUsagePayloadCache: depsSelectorUsageCache,
        };
  const selectedQueryBackend = resolveSelectedQueryBackendKind(queryOptions.env);
  if (!usesRustSelectorUsageBackend(selectedQueryBackend)) {
    return readCurrentUnusedStyleSelectors(args, deps);
  }

  const hasUnresolvedDynamicUsage = deps.semanticReferenceIndex
    .findModuleUsages(args.scssPath)
    .some((usage) => usage.isDynamic && !usage.hasResolvedTargets);
  if (hasUnresolvedDynamicUsage) {
    return [];
  }

  const graphUnused = usesRustStyleSemanticGraphBackend(selectedQueryBackend)
    ? resolveGraphUnusedStyleSelectors(args, deps, queryOptions)
    : null;
  if (graphUnused) return graphUnused;

  const readRustPayload = createRustSelectorUsagePayloadReader(
    {
      workspaceRoot: deps.workspaceRoot,
      classnameTransform: deps.settings.scss.classnameTransform,
      pathAlias: deps.settings.pathAlias,
    },
    deps,
    args.scssPath,
    queryOptions,
  );
  const unused: StyleModuleUsageSelectorSummary[] = [];

  for (const selector of listCanonicalSelectors(args.styleDocument)) {
    const payload = readRustPayload(selector.canonicalName);
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

export async function resolveUnusedStyleSelectorsAsync(
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
  > & {
    readonly readStyleFile?: ProviderDeps["readStyleFile"];
    readonly styleSemanticGraphCache?: StyleSemanticGraphCache;
  },
  options: StyleModuleUsageQueryOptions = {},
): Promise<readonly StyleModuleUsageSelectorSummary[]> {
  const depsSelectorUsageCache = (
    deps as {
      readonly selectorUsagePayloadCache?: SelectorUsagePayloadCache;
    }
  ).selectorUsagePayloadCache;
  const queryOptions =
    options.selectorUsagePayloadCache || !depsSelectorUsageCache
      ? options
      : {
          ...options,
          selectorUsagePayloadCache: depsSelectorUsageCache,
        };
  const selectedQueryBackend = resolveSelectedQueryBackendKind(queryOptions.env);
  if (!usesRustSelectorUsageBackend(selectedQueryBackend)) {
    return readCurrentUnusedStyleSelectors(args, deps);
  }

  const hasUnresolvedDynamicUsage = deps.semanticReferenceIndex
    .findModuleUsages(args.scssPath)
    .some((usage) => usage.isDynamic && !usage.hasResolvedTargets);
  if (hasUnresolvedDynamicUsage) {
    return [];
  }

  const graphUnused = usesRustStyleSemanticGraphBackend(selectedQueryBackend)
    ? await resolveGraphUnusedStyleSelectorsAsync(args, deps, queryOptions)
    : null;
  if (graphUnused) return graphUnused;

  const readRustPayload = createRustSelectorUsagePayloadReaderAsync(
    {
      workspaceRoot: deps.workspaceRoot,
      classnameTransform: deps.settings.scss.classnameTransform,
      pathAlias: deps.settings.pathAlias,
    },
    deps,
    args.scssPath,
    queryOptions,
  );
  const unused: StyleModuleUsageSelectorSummary[] = [];

  for (const selector of listCanonicalSelectors(args.styleDocument)) {
    const payload = await readRustPayload(selector.canonicalName);
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

function createRustSelectorUsagePayloadReader(
  args: {
    readonly workspaceRoot: string;
    readonly classnameTransform: ProviderDeps["settings"]["scss"]["classnameTransform"];
    readonly pathAlias: ProviderDeps["settings"]["pathAlias"];
  },
  deps: Pick<ProviderDeps, "analysisCache" | "styleDocumentForPath" | "typeResolver">,
  filePath: string,
  options: StyleModuleUsageQueryOptions,
): (canonicalName: string) => SelectorUsageEvaluatorCandidatePayloadV0 | null {
  if (options.readRustSelectorUsagePayloadForWorkspaceTarget) {
    return (canonicalName) =>
      options.readRustSelectorUsagePayloadForWorkspaceTarget!(args, deps, filePath, canonicalName);
  }

  const readPayloads =
    options.readRustSelectorUsagePayloadsForWorkspaceTarget ??
    resolveRustSelectorUsagePayloadsForWorkspaceTarget;
  let payloadsByName: ReadonlyMap<string, SelectorUsageEvaluatorCandidatePayloadV0> | null = null;

  return (canonicalName) => {
    if (!payloadsByName) {
      payloadsByName = new Map(
        readPayloads(args, deps, filePath, options.selectorUsagePayloadCache).map((candidate) => [
          candidate.queryId,
          candidate.payload,
        ]),
      );
    }
    return payloadsByName.get(canonicalName) ?? null;
  };
}

function createRustSelectorUsagePayloadReaderAsync(
  args: {
    readonly workspaceRoot: string;
    readonly classnameTransform: ProviderDeps["settings"]["scss"]["classnameTransform"];
    readonly pathAlias: ProviderDeps["settings"]["pathAlias"];
  },
  deps: Pick<ProviderDeps, "analysisCache" | "styleDocumentForPath" | "typeResolver">,
  filePath: string,
  options: StyleModuleUsageQueryOptions,
): (canonicalName: string) => Promise<SelectorUsageEvaluatorCandidatePayloadV0 | null> {
  if (options.readRustSelectorUsagePayloadForWorkspaceTargetAsync) {
    return (canonicalName) =>
      options.readRustSelectorUsagePayloadForWorkspaceTargetAsync!(
        args,
        deps,
        filePath,
        canonicalName,
        options.selectorUsagePayloadCache,
        options.runRustSelectedQueryBackendJsonAsync,
      );
  }

  const readPayloads =
    options.readRustSelectorUsagePayloadsForWorkspaceTargetAsync ??
    resolveRustSelectorUsagePayloadsForWorkspaceTargetAsync;
  let payloadsByNamePromise: Promise<
    ReadonlyMap<string, SelectorUsageEvaluatorCandidatePayloadV0>
  > | null = null;

  return async (canonicalName) => {
    payloadsByNamePromise ??= readPayloads(
      args,
      deps,
      filePath,
      options.selectorUsagePayloadCache,
      options.runRustSelectedQueryBackendJsonAsync,
    ).then(
      (payloads) =>
        new Map(payloads.map((candidate) => [candidate.queryId, candidate.payload] as const)),
    );
    return (await payloadsByNamePromise).get(canonicalName) ?? null;
  };
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
  > & {
    readonly readStyleFile?: ProviderDeps["readStyleFile"];
    readonly styleSemanticGraphCache?: StyleSemanticGraphCache;
  },
  options: StyleModuleUsageQueryOptions,
): readonly StyleModuleUsageSelectorSummary[] | null {
  const currentUsage = readStyleModuleUsageSummary(
    args.scssPath,
    args.styleDocument,
    deps.semanticReferenceIndex,
    deps.styleDependencyGraph,
  );
  if (currentUsage.unusedSelectors.length === 0) return [];

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
  const currentUnusedSelectors = new Set(
    currentUsage.unusedSelectors.map((selector) => selector.canonicalName),
  );

  for (const selector of listCanonicalSelectors(args.styleDocument)) {
    const referenceSummary = referenceSummaryByName.get(selector.canonicalName);
    if (!referenceSummary) return null;
    if (!referenceSummary.hasAnyReferences) {
      if (!currentUnusedSelectors.has(selector.canonicalName)) {
        return currentUsage.unusedSelectors.map(toStyleModuleUsageSelectorSummary);
      }
      unused.push({
        canonicalName: selector.canonicalName,
        range: selector.range,
      });
    }
  }

  return unused;
}

async function resolveGraphUnusedStyleSelectorsAsync(
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
  > & {
    readonly readStyleFile?: ProviderDeps["readStyleFile"];
    readonly styleSemanticGraphCache?: StyleSemanticGraphCache;
  },
  options: StyleModuleUsageQueryOptions,
): Promise<readonly StyleModuleUsageSelectorSummary[] | null> {
  const currentUsage = readStyleModuleUsageSummary(
    args.scssPath,
    args.styleDocument,
    deps.semanticReferenceIndex,
    deps.styleDependencyGraph,
  );
  if (currentUsage.unusedSelectors.length === 0) return [];

  if (!deps.readStyleFile) return null;
  const graphSelectors = await resolveRustStyleSelectorReferenceSummariesForWorkspaceTargetAsync(
    { filePath: args.scssPath },
    { ...deps, readStyleFile: deps.readStyleFile },
    options,
  );
  if (!graphSelectors) return null;

  const referenceSummaryByName = new Map(
    graphSelectors.map((selector) => [selector.localName, selector] as const),
  );
  const unused: StyleModuleUsageSelectorSummary[] = [];
  const currentUnusedSelectors = new Set(
    currentUsage.unusedSelectors.map((selector) => selector.canonicalName),
  );

  for (const selector of listCanonicalSelectors(args.styleDocument)) {
    const referenceSummary = referenceSummaryByName.get(selector.canonicalName);
    if (!referenceSummary) return null;
    if (!referenceSummary.hasAnyReferences) {
      if (!currentUnusedSelectors.has(selector.canonicalName)) {
        return currentUsage.unusedSelectors.map(toStyleModuleUsageSelectorSummary);
      }
      unused.push({
        canonicalName: selector.canonicalName,
        range: selector.range,
      });
    }
  }

  return unused;
}

function toStyleModuleUsageSelectorSummary(
  selector: ReturnType<typeof readStyleModuleUsageSummary>["unusedSelectors"][number],
): StyleModuleUsageSelectorSummary {
  return {
    canonicalName: selector.canonicalName,
    range: selector.range,
  };
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
