import type { Position, ShowReferencesLocation } from "@css-module-explainer/shared";
import {
  listCanonicalSelectors,
  readSelectorUsageSummary,
} from "../../engine-core-ts/src/core/query";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export interface StyleReferenceLensSummary {
  readonly position: Position;
  readonly title: string;
  readonly locations: readonly ShowReferencesLocation[];
}

export function resolveStyleReferenceLenses(
  filePath: string,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    "semanticReferenceIndex" | "styleDependencyGraph" | "styleDocumentForPath"
  >,
): readonly StyleReferenceLensSummary[] {
  const lenses: StyleReferenceLensSummary[] = [];
  for (const selector of listCanonicalSelectors(styleDocument)) {
    const usage = readSelectorUsageSummary(deps, filePath, selector.canonicalName);
    if (!usage.hasAnyReferences) continue;

    lenses.push({
      position: selector.range.start,
      title: formatReferenceLensTitle(usage),
      locations: usage.allSites.map((site) => ({
        uri: site.uri,
        range: site.range,
      })),
    });
  }
  return lenses;
}

function formatReferenceLensTitle(usage: ReturnType<typeof readSelectorUsageSummary>): string {
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
