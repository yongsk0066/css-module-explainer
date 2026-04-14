import type { Range } from "@css-module-explainer/shared";
import type { StyleDocumentHIR } from "../hir/style-types";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";
import { listCanonicalSelectors } from "./find-style-selector";
import { readSelectorUsageSummary, type SelectorUsageSummary } from "./read-selector-usage";

export interface StyleModuleSelectorUsage {
  readonly canonicalName: string;
  readonly range: Range;
  readonly usage: SelectorUsageSummary;
}

export interface StyleModuleUsageSummary {
  readonly hasUnresolvedDynamicUsage: boolean;
  readonly selectors: readonly StyleModuleSelectorUsage[];
  readonly unusedSelectors: readonly StyleModuleSelectorUsage[];
}

export function readStyleModuleUsageSummary(
  scssPath: string,
  styleDocument: StyleDocumentHIR,
  semanticReferenceIndex: SemanticWorkspaceReferenceIndex,
): StyleModuleUsageSummary {
  const hasUnresolvedDynamicUsage = semanticReferenceIndex
    .findModuleUsages(scssPath)
    .some((usage) => usage.isDynamic && !usage.hasResolvedTargets);

  const composedClasses = new Set<string>();
  for (const selector of listCanonicalSelectors(styleDocument)) {
    for (const ref of selector.composes) {
      if (!ref.from && !ref.fromGlobal) {
        for (const name of ref.classNames) composedClasses.add(name);
      }
    }
  }

  const selectors = listCanonicalSelectors(styleDocument)
    .filter((selector) => !composedClasses.has(selector.canonicalName))
    .map((selector) => ({
      canonicalName: selector.canonicalName,
      range: selector.range,
      usage: readSelectorUsageSummary({ semanticReferenceIndex }, scssPath, selector.canonicalName),
    }));

  return {
    hasUnresolvedDynamicUsage,
    selectors,
    unusedSelectors: hasUnresolvedDynamicUsage
      ? []
      : selectors.filter((selector) => !selector.usage.hasAnyReferences),
  };
}
