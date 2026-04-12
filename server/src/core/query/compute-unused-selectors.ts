import type { Range } from "@css-module-explainer/shared";
import type { StyleDocumentHIR } from "../hir/style-types";
import { listCanonicalSelectors } from "./find-style-selector";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";

export interface UnusedSelectorFinding {
  readonly canonicalName: string;
  readonly range: Range;
}

export function findUnusedSelectors(
  scssPath: string,
  styleDocument: StyleDocumentHIR,
  semanticReferenceIndex: SemanticWorkspaceReferenceIndex,
): readonly UnusedSelectorFinding[] {
  const hasUnresolvedDynamicUsage = semanticReferenceIndex
    .findModuleUsages(scssPath)
    .some((usage) => usage.isDynamic && !usage.hasResolvedTargets);
  if (hasUnresolvedDynamicUsage) return [];

  const composedClasses = new Set<string>();
  for (const selector of listCanonicalSelectors(styleDocument)) {
    for (const ref of selector.composes) {
      if (!ref.from && !ref.fromGlobal) {
        for (const name of ref.classNames) composedClasses.add(name);
      }
    }
  }

  const findings: UnusedSelectorFinding[] = [];
  for (const selector of listCanonicalSelectors(styleDocument)) {
    if (composedClasses.has(selector.canonicalName)) continue;

    const refCount = semanticReferenceIndex.countSelectorReferences(
      scssPath,
      selector.canonicalName,
    );
    if (refCount > 0) continue;

    findings.push({ canonicalName: selector.canonicalName, range: selector.range });
  }

  return findings;
}
