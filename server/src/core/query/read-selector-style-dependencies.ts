import type {
  StyleDependencyGraph,
  StyleDependencySelectorRef,
} from "../semantic/style-dependency-graph";

export interface SelectorStyleDependencySummary {
  readonly incoming: readonly StyleDependencySelectorRef[];
  readonly outgoing: readonly StyleDependencySelectorRef[];
}

export function readSelectorStyleDependencySummary(
  styleDependencyGraph: StyleDependencyGraph,
  scssPath: string,
  canonicalName: string,
): SelectorStyleDependencySummary {
  return {
    incoming: styleDependencyGraph.getIncoming(scssPath, canonicalName),
    outgoing: styleDependencyGraph.getOutgoing(scssPath, canonicalName),
  };
}
