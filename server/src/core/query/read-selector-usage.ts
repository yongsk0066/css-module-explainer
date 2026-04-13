import type { EdgeCertainty } from "../semantic/certainty";
import type { ReferenceQueryEnv, ResolvedReferenceSite } from "./find-references";
import { findSelectorReferenceSites } from "./find-references";

export interface SelectorUsageSummary {
  readonly allSites: readonly ResolvedReferenceSite[];
  readonly directSites: readonly ResolvedReferenceSite[];
  readonly exactSites: readonly ResolvedReferenceSite[];
  readonly inferredOrBetterSites: readonly ResolvedReferenceSite[];
  readonly totalReferences: number;
  readonly directReferenceCount: number;
  readonly hasExpandedReferences: boolean;
  readonly hasAnyReferences: boolean;
}

export function readSelectorUsageSummary(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): SelectorUsageSummary {
  const allSites = findSelectorReferenceSites(deps, scssPath, canonicalName, {
    includeExpanded: true,
  });
  const directSites = allSites.filter((site) => site.expansion === "direct");
  const exactSites = allSites.filter((site) => site.selectorCertainty === "exact");
  const inferredOrBetterSites = filterMinimumSelectorCertainty(allSites, "inferred");
  return {
    allSites,
    directSites,
    exactSites,
    inferredOrBetterSites,
    totalReferences: allSites.length,
    directReferenceCount: directSites.length,
    hasExpandedReferences: directSites.length !== allSites.length,
    hasAnyReferences: allSites.length > 0,
  };
}

function filterMinimumSelectorCertainty(
  sites: readonly ResolvedReferenceSite[],
  minimumSelectorCertainty: EdgeCertainty,
): readonly ResolvedReferenceSite[] {
  switch (minimumSelectorCertainty) {
    case "exact":
      return sites.filter((site) => site.selectorCertainty === "exact");
    case "inferred":
      return sites.filter(
        (site) => site.selectorCertainty === "exact" || site.selectorCertainty === "inferred",
      );
    case "possible":
      return sites;
    default:
      minimumSelectorCertainty satisfies never;
      return sites;
  }
}
