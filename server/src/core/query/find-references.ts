import type { Range } from "@css-module-explainer/shared";
import type { ReverseIndex } from "../indexing/reverse-index";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";

export interface ResolvedReferenceSite {
  readonly uri: string;
  readonly range: Range;
  readonly className: string;
  readonly expansion: "direct" | "expanded";
}

export interface ReferenceQueryEnv {
  readonly reverseIndex: ReverseIndex;
  readonly semanticReferenceIndex: SemanticWorkspaceReferenceIndex;
}

export function findSelectorReferenceSites(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): readonly ResolvedReferenceSite[] {
  const semanticSites = deps.semanticReferenceIndex.findSelectorReferences(scssPath, canonicalName);
  if (semanticSites.length > 0) {
    return semanticSites.map((site) => ({
      uri: site.uri,
      range: site.range,
      className: site.className,
      expansion: site.expansion,
    }));
  }

  return deps.reverseIndex.find(scssPath, canonicalName).flatMap((site) => {
    if (site.match.kind !== "static") return [];
    return [
      {
        uri: site.uri,
        range: site.range,
        className: site.match.className,
        expansion: site.expansion,
      } satisfies ResolvedReferenceSite,
    ];
  });
}

export function countSelectorReferenceSites(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): number {
  return findSelectorReferenceSites(deps, scssPath, canonicalName).length;
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
