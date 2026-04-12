import type { ReferenceQueryEnv } from "./find-references";
import { hasNonDirectSelectorReferenceSites } from "./find-references";

export function hasBlockingRenameReferences(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): boolean {
  return hasNonDirectSelectorReferenceSites(deps, scssPath, canonicalName);
}
