import { filterSelectorReferencePolicy } from "../semantic/reference-policy";
import type { ReferenceQueryEnv, ResolvedReferenceSite } from "./find-references";
import { findSelectorReferenceSites } from "./find-references";

export interface SelectorUsageSummary {
  readonly allSites: readonly ResolvedReferenceSite[];
  readonly directSites: readonly ResolvedReferenceSite[];
  readonly editableDirectSites: readonly ResolvedReferenceSite[];
  readonly exactSites: readonly ResolvedReferenceSite[];
  readonly inferredOrBetterSites: readonly ResolvedReferenceSite[];
  readonly totalReferences: number;
  readonly directReferenceCount: number;
  readonly hasExpandedReferences: boolean;
  readonly hasStyleDependencyReferences: boolean;
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
  const editableDirectSites = directSites.filter((site) => site.referenceKind === "source");
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
    editableDirectSites,
    exactSites,
    inferredOrBetterSites,
    totalReferences: allSites.length,
    directReferenceCount: directSites.length,
    hasExpandedReferences: directSites.length !== allSites.length,
    hasStyleDependencyReferences: allSites.some((site) => site.referenceKind === "styleDependency"),
    hasAnyReferences: allSites.length > 0,
  };
}
