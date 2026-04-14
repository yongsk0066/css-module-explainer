import { filterSelectorReferencePolicy } from "../semantic/reference-policy";
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
  const directSites = filterSelectorReferencePolicy(allSites, { includeExpanded: false });
  const exactSites = filterSelectorReferencePolicy(allSites, {
    minimumSelectorCertainty: "exact",
    includeExpanded: true,
  });
  const inferredOrBetterSites = filterSelectorReferencePolicy(allSites, {
    minimumSelectorCertainty: "inferred",
    includeExpanded: true,
  });
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
