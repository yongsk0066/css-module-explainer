import type { Range } from "@css-module-explainer/shared";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";

export interface ResolvedReferenceSite {
  readonly uri: string;
  readonly range: Range;
  readonly className: string;
  readonly expansion: "direct" | "expanded";
}

export interface ReferenceQueryEnv {
  readonly semanticReferenceIndex: SemanticWorkspaceReferenceIndex;
}

export function findSelectorReferenceSites(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): readonly ResolvedReferenceSite[] {
  return deps.semanticReferenceIndex
    .findSelectorReferences(scssPath, canonicalName)
    .map((site) => ({
      uri: site.uri,
      range: site.range,
      className: site.className,
      expansion: site.expansion,
    }));
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
