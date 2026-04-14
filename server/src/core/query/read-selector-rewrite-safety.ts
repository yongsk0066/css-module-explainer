import type { ReferenceQueryEnv, ResolvedReferenceSite } from "./find-references";
import { readSelectorUsageSummary, type SelectorUsageSummary } from "./read-selector-usage";

export type SelectorReferenceRewritePolicy =
  | "directOnly"
  | "blockedByExpandedReferences"
  | "blockedByStyleDependencies";

export interface SelectorRewriteSafetySummary {
  readonly canonicalName: string;
  readonly usage: SelectorUsageSummary;
  readonly directSites: readonly ResolvedReferenceSite[];
  readonly referenceRewritePolicy: SelectorReferenceRewritePolicy;
  readonly hasBlockingExpandedReferences: boolean;
  readonly hasBlockingStyleDependencyReferences: boolean;
}

export function readSelectorRewriteSafetySummary(
  deps: ReferenceQueryEnv,
  scssPath: string,
  canonicalName: string,
): SelectorRewriteSafetySummary {
  const usage = readSelectorUsageSummary(deps, scssPath, canonicalName);
  const hasBlockingStyleDependencyReferences = usage.hasStyleDependencyReferences;
  const hasBlockingExpandedReferences = usage.hasExpandedReferences;
  return {
    canonicalName,
    usage,
    directSites: usage.editableDirectSites,
    referenceRewritePolicy: hasBlockingStyleDependencyReferences
      ? "blockedByStyleDependencies"
      : hasBlockingExpandedReferences
        ? "blockedByExpandedReferences"
        : "directOnly",
    hasBlockingExpandedReferences,
    hasBlockingStyleDependencyReferences,
  };
}
