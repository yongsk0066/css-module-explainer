import type { Range, ScssClassMap } from "@css-module-explainer/shared";
import { canonicalNameOf } from "../scss/classname-transform";
import type { ReverseIndex } from "../indexing/reverse-index";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";

export interface UnusedSelectorFinding {
  readonly canonicalName: string;
  readonly range: Range;
}

export function findUnusedSelectors(
  scssPath: string,
  classMap: ScssClassMap,
  reverseIndex: ReverseIndex,
  semanticReferenceIndex: SemanticWorkspaceReferenceIndex,
): readonly UnusedSelectorFinding[] {
  const hasUnresolvedDynamicUsage = semanticReferenceIndex
    .findModuleUsages(scssPath)
    .some((usage) => usage.isDynamic && !usage.hasResolvedTargets);
  if (hasUnresolvedDynamicUsage) return [];

  const composedClasses = new Set<string>();
  for (const selectorInfo of classMap.values()) {
    if (!selectorInfo.composes) continue;
    for (const ref of selectorInfo.composes) {
      if (!ref.from && !ref.fromGlobal) {
        for (const name of ref.classNames) composedClasses.add(name);
      }
    }
  }

  const findings: UnusedSelectorFinding[] = [];
  const emittedCanonical = new Set<string>();
  for (const info of classMap.values()) {
    const canonical = canonicalNameOf(info);
    if (emittedCanonical.has(canonical)) continue;
    emittedCanonical.add(canonical);
    if (composedClasses.has(canonical)) continue;

    const refCount = Math.max(
      semanticReferenceIndex.countSelectorReferences(scssPath, canonical),
      reverseIndex.count(scssPath, canonical),
    );
    if (refCount > 0) continue;

    findings.push({ canonicalName: canonical, range: info.range });
  }

  return findings;
}
