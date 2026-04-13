import type { Range } from "@css-module-explainer/shared";
import type { EdgeCertainty } from "../semantic/certainty";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";

export interface ResolvedReferenceSite {
  readonly uri: string;
  readonly range: Range;
  readonly className: string;
  readonly certainty: EdgeCertainty;
  readonly expansion: "direct" | "expanded";
}

export interface ReferenceQueryEnv {
  readonly semanticReferenceIndex: SemanticWorkspaceReferenceIndex;
}

export interface ReferenceSiteQueryOptions {
  readonly minimumCertainty?: EdgeCertainty;
  readonly includeExpanded?: boolean;
}

export function findSelectorReferenceSites(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
  options?: ReferenceSiteQueryOptions,
): readonly ResolvedReferenceSite[] {
  const queryOptions = options?.minimumCertainty
    ? { minimumCertainty: options.minimumCertainty }
    : undefined;
  return deps.semanticReferenceIndex
    .findSelectorReferences(scssPath, canonicalName, queryOptions)
    .map((site) => ({
      uri: site.uri,
      range: site.range,
      className: site.className,
      certainty: site.certainty,
      expansion: site.expansion,
    }))
    .filter((site) => (options?.includeExpanded === false ? site.expansion === "direct" : true));
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
