import type { Range } from "@css-module-explainer/shared";
import type { EdgeCertainty } from "../semantic/certainty";
import {
  filterSelectorReferencePolicy,
  type SelectorReferencePolicy,
} from "../semantic/reference-policy";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";

export interface ResolvedReferenceSite {
  readonly uri: string;
  readonly range: Range;
  readonly className: string;
  readonly selectorCertainty: EdgeCertainty;
  readonly expansion: "direct" | "expanded";
}

export interface ReferenceQueryEnv {
  readonly semanticReferenceIndex: SemanticWorkspaceReferenceIndex;
}

export interface ReferenceSiteQueryOptions extends SelectorReferencePolicy {}

export function findSelectorReferenceSites(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
  options?: ReferenceSiteQueryOptions,
): readonly ResolvedReferenceSite[] {
  const queryOptions = options?.minimumSelectorCertainty
    ? { minimumSelectorCertainty: options.minimumSelectorCertainty }
    : undefined;
  return filterSelectorReferencePolicy(
    deps.semanticReferenceIndex
      .findSelectorReferences(scssPath, canonicalName, queryOptions)
      .map((site) => ({
        uri: site.uri,
        range: site.range,
        className: site.className,
        selectorCertainty: site.selectorCertainty,
        expansion: site.expansion,
      })),
    options,
  );
}

export function countSelectorReferenceSites(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
  options?: ReferenceSiteQueryOptions,
): number {
  return findSelectorReferenceSites(deps, scssPath, canonicalName, options).length;
}

export function hasNonDirectSelectorReferenceSites(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): boolean {
  return findSelectorReferenceSites(deps, scssPath, canonicalName).some(
    (site) => site.expansion !== "direct",
  );
}
