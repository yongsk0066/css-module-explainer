import type { ReferenceQueryEnv } from "./find-references";
import { readSelectorUsageSummary } from "./read-selector-usage";

export function hasBlockingRenameReferences(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): boolean {
  return readSelectorUsageSummary(deps, scssPath, canonicalName).hasExpandedReferences;
}
