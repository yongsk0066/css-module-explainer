import type { Position, ShowReferencesLocation } from "@css-module-explainer/shared";
import {
  listCanonicalSelectors,
  readSelectorUsageSummary,
} from "../../engine-core-ts/src/core/query";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { resolveSelectedQueryBackendKind } from "./selected-query-backend";
import {
  buildSelectorUsageRenderSummaryFromRustPayload,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
  type SelectorUsageRenderSummary,
} from "./selector-usage-query-backend";

export interface StyleReferenceLensSummary {
  readonly position: Position;
  readonly title: string;
  readonly locations: readonly ShowReferencesLocation[];
}

export interface StyleReferenceLensQueryOptions {
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
  >,
  options: StyleReferenceLensQueryOptions = {},
): readonly StyleReferenceLensSummary[] {
  const lenses: StyleReferenceLensSummary[] = [];
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  for (const selector of listCanonicalSelectors(styleDocument)) {
    const usage = readSelectorUsageSummary(deps, filePath, selector.canonicalName);
    if (!usage.hasAnyReferences) continue;
    const titleUsage =
      selectedQueryBackend === "rust-selector-usage"
        ? (resolveRustReferenceLensSummary(
            deps,
            filePath,
            selector.canonicalName,
            options.readRustSelectorUsagePayloadForWorkspaceTarget ??
              resolveRustSelectorUsagePayloadForWorkspaceTarget,
          ) ?? usage)
        : usage;

    lenses.push({
      position: selector.range.start,
      title: formatReferenceLensTitle(titleUsage),
      locations: usage.allSites.map((site) => ({
        uri: site.uri,
        range: site.range,
      })),
    });
  }
  return lenses;
}

function resolveRustReferenceLensSummary(
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  filePath: string,
  canonicalName: string,
  readRustSelectorUsagePayloadForWorkspaceTarget: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget,
): SelectorUsageRenderSummary | null {
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
  return buildSelectorUsageRenderSummaryFromRustPayload(payload);
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
