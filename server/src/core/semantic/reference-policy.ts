import { rankCertainty, type EdgeCertainty } from "./certainty";

export interface SelectorReferenceLike {
  readonly selectorCertainty: EdgeCertainty;
  readonly expansion: "direct" | "expanded";
}

export interface SelectorReferencePolicy {
  readonly minimumSelectorCertainty?: EdgeCertainty;
  readonly includeExpanded?: boolean;
}

export function matchesMinimumSelectorCertainty(
  selectorCertainty: EdgeCertainty,
  minimumSelectorCertainty: EdgeCertainty | undefined,
): boolean {
  if (!minimumSelectorCertainty) return true;
  return rankCertainty(selectorCertainty) >= rankCertainty(minimumSelectorCertainty);
}

export function matchesSelectorReferencePolicy(
  site: SelectorReferenceLike,
  policy?: SelectorReferencePolicy,
): boolean {
  if (!matchesMinimumSelectorCertainty(site.selectorCertainty, policy?.minimumSelectorCertainty)) {
    return false;
  }
  if (policy?.includeExpanded === false && site.expansion !== "direct") {
    return false;
  }
  return true;
}

export function filterSelectorReferencePolicy<T extends SelectorReferenceLike>(
  sites: readonly T[],
  policy?: SelectorReferencePolicy,
): readonly T[] {
  if (!policy?.minimumSelectorCertainty && policy?.includeExpanded !== false) return sites;
  return sites.filter((site) => matchesSelectorReferencePolicy(site, policy));
}
