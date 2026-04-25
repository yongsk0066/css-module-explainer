import type { Position, ShowReferencesLocation } from "@css-module-explainer/shared";
import {
  listCanonicalSelectors,
  readSelectorUsageSummary,
} from "../../engine-core-ts/src/core/query";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { pathToFileUrl } from "../../engine-core-ts/src/core/util/text-utils";
import {
  resolveSelectedQueryBackendKind,
  usesRustSelectorUsageBackend,
} from "./selected-query-backend";
import {
  buildSelectorUsageLocationsFromRustPayload,
  buildSelectorUsageRenderSummaryFromRustPayload,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
  type SelectorUsageRenderSummary,
} from "./selector-usage-query-backend";
import {
  buildSelectorReferenceRenderSummaryFromRustGraph,
  resolveRustStyleSelectorReferenceSummaryForWorkspaceTarget,
  type StyleSelectorReferenceQueryOptions,
} from "./style-selector-reference-query";

export interface StyleReferenceLensSummary {
  readonly position: Position;
  readonly title: string;
  readonly locations: readonly ShowReferencesLocation[];
}

export interface StyleReferenceLensQueryOptions extends StyleSelectorReferenceQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export function resolveStyleReferenceLenses(
  filePath: string,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "settings"
    | "readStyleFile"
  >,
  options: StyleReferenceLensQueryOptions = {},
): readonly StyleReferenceLensSummary[] {
  const lenses: StyleReferenceLensSummary[] = [];
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  for (const selector of listCanonicalSelectors(styleDocument)) {
    const rustLensResolution =
      resolveRustGraphReferenceLensSummary(deps, filePath, selector.canonicalName, options) ??
      (usesRustSelectorUsageBackend(selectedQueryBackend)
        ? resolveRustReferenceLensSummary(
            deps,
            filePath,
            selector.canonicalName,
            options.readRustSelectorUsagePayloadForWorkspaceTarget ??
              resolveRustSelectorUsagePayloadForWorkspaceTarget,
          )
        : null);
    if (rustLensResolution) {
      if (!rustLensResolution.usage.hasAnyReferences) continue;
      lenses.push({
        position: selector.range.start,
        title: formatReferenceLensTitle(rustLensResolution.usage),
        locations: rustLensResolution.locations,
      });
      continue;
    }

    const currentUsage = readSelectorUsageSummary(deps, filePath, selector.canonicalName);
    if (!currentUsage.hasAnyReferences) continue;

    lenses.push({
      position: selector.range.start,
      title: formatReferenceLensTitle(currentUsage),
      locations: currentUsage.allSites.map((site) => ({
        uri: site.uri,
        range: site.range,
      })),
    });
  }
  return lenses;
}

function resolveRustGraphReferenceLensSummary(
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "settings"
    | "readStyleFile"
  >,
  filePath: string,
  canonicalName: string,
  options: StyleReferenceLensQueryOptions,
): {
  readonly usage: SelectorUsageRenderSummary;
  readonly locations: readonly ShowReferencesLocation[];
} | null {
  const selector = resolveRustStyleSelectorReferenceSummaryForWorkspaceTarget(
    {
      filePath,
      canonicalName,
    },
    deps,
    options,
  );
  if (!selector) return null;
  return {
    usage: buildSelectorReferenceRenderSummaryFromRustGraph(selector),
    locations: selector.sites.map((site) => ({
      uri: pathToFileUrl(site.filePath),
      range: site.range,
    })),
  };
}

function resolveRustReferenceLensSummary(
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  filePath: string,
  canonicalName: string,
  readRustSelectorUsagePayloadForWorkspaceTarget: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget,
): {
  readonly usage: SelectorUsageRenderSummary;
  readonly locations: readonly ShowReferencesLocation[];
} | null {
  const payload = readRustSelectorUsagePayloadForWorkspaceTarget(
    {
      workspaceRoot: deps.workspaceRoot,
      classnameTransform: deps.settings.scss.classnameTransform,
      pathAlias: deps.settings.pathAlias,
    },
    deps,
    filePath,
    canonicalName,
  );
  if (!payload || !payload.hasAnyReferences) return null;
  return {
    usage: buildSelectorUsageRenderSummaryFromRustPayload(payload),
    locations:
      buildSelectorUsageLocationsFromRustPayload(payload)?.map((site) => ({
        uri: pathToFileUrl(site.filePath),
        range: site.range,
      })) ?? [],
  };
}

function formatReferenceLensTitle(usage: SelectorUsageRenderSummary): string {
  const base = `${usage.totalReferences} reference${usage.totalReferences === 1 ? "" : "s"}`;
  const details: string[] = [];
  if (usage.totalReferences !== usage.directReferenceCount) {
    details.push(`${usage.directReferenceCount} direct`);
  }
  if (usage.hasStyleDependencyReferences) {
    details.push("composed");
  }
  if (usage.hasExpandedReferences) {
    details.push("dynamic");
  }
  return details.length > 0 ? `${base} (${details.join(", ")})` : base;
}
