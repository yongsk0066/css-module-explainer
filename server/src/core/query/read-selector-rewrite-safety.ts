import type { ReferenceQueryEnv, ResolvedReferenceSite } from "./find-references";
import { readSelectorUsageSummary, type SelectorUsageSummary } from "./read-selector-usage";

export type SelectorReferenceRewritePolicy = "directOnly" | "blockedByExpandedReferences";

export interface SelectorRewriteSafetySummary {
  readonly canonicalName: string;
  readonly usage: SelectorUsageSummary;
  readonly directSites: readonly ResolvedReferenceSite[];
  readonly referenceRewritePolicy: SelectorReferenceRewritePolicy;
  readonly hasBlockingExpandedReferences: boolean;
}

export function readSelectorRewriteSafetySummary(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): SelectorRewriteSafetySummary {
  const usage = readSelectorUsageSummary(deps, scssPath, canonicalName);
  const hasBlockingExpandedReferences = usage.hasExpandedReferences;
  return {
    canonicalName,
    usage,
    directSites: usage.directSites,
    referenceRewritePolicy: hasBlockingExpandedReferences
      ? "blockedByExpandedReferences"
      : "directOnly",
    hasBlockingExpandedReferences,
  };
}
