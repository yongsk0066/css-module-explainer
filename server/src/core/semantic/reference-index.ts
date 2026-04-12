import { pathToFileURL } from "node:url";
import type { ClassRefOrigin, Range } from "@css-module-explainer/shared";
import { rankCertainty, type EdgeCertainty } from "./certainty";
import type { EdgeReason } from "./provenance";
import type { RefNode, SelectorNode, SemanticGraph, SemanticNode } from "./graph-types";

export interface SemanticReferenceSite {
  readonly refId: string;
  readonly selectorId: string;
  readonly filePath: string;
  readonly uri: string;
  readonly range: Range;
  readonly origin: ClassRefOrigin;
  readonly scssModulePath: string;
  readonly selectorFilePath: string;
  readonly canonicalName: string;
  readonly className: string;
  readonly certainty: EdgeCertainty;
  readonly reason: EdgeReason;
  readonly expansion: "direct" | "expanded";
}

export interface SemanticRefTarget {
  readonly refId: string;
  readonly selectorId: string;
  readonly selectorFilePath: string;
  readonly canonicalName: string;
  readonly certainty: EdgeCertainty;
  readonly reason: EdgeReason;
}

export interface ReferenceQueryOptions {
  readonly minimumCertainty?: EdgeCertainty;
}

export interface SemanticReferenceIndex {
  listReferenceSites(): readonly SemanticReferenceSite[];
  findSelectorReferences(
    scssPath: string,
    canonicalName: string,
    options?: ReferenceQueryOptions,
  ): readonly SemanticReferenceSite[];
  countSelectorReferences(
    scssPath: string,
    canonicalName: string,
    options?: ReferenceQueryOptions,
  ): number;
  findAllForScssPath(
    scssPath: string,
    options?: ReferenceQueryOptions,
  ): readonly SemanticReferenceSite[];
  findTargetsForRef(refId: string, options?: ReferenceQueryOptions): readonly SemanticRefTarget[];
}

export function buildSemanticReferenceIndex(graph: SemanticGraph): SemanticReferenceIndex {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const selectorToSites = new Map<string, SemanticReferenceSite[]>();
  const scssToSites = new Map<string, SemanticReferenceSite[]>();
  const refToTargets = new Map<string, SemanticRefTarget[]>();

  for (const edge of graph.edges) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!isRefNode(from) || !isSelectorNode(to)) continue;

    const site = toReferenceSite(from, to, edge.reason, edge.certainty);
    const selectorKey = selectorKeyFor(to.filePath, to.canonicalName);
    push(selectorToSites, selectorKey, site);
    push(scssToSites, to.filePath, site);
    push(refToTargets, from.id, {
      refId: from.id,
      selectorId: to.id,
      selectorFilePath: to.filePath,
      canonicalName: to.canonicalName,
      certainty: edge.certainty,
      reason: edge.reason,
    });
  }

  return {
    listReferenceSites() {
      return Array.from(selectorToSites.values()).flatMap((sites) => sites);
    },
    findSelectorReferences(scssPath, canonicalName, options) {
      const sites = selectorToSites.get(selectorKeyFor(scssPath, canonicalName)) ?? [];
      return filterByCertainty(sites, options);
    },
    countSelectorReferences(scssPath, canonicalName, options) {
      return this.findSelectorReferences(scssPath, canonicalName, options).length;
    },
    findAllForScssPath(scssPath, options) {
      const sites = scssToSites.get(scssPath) ?? [];
      return filterByCertainty(sites, options);
    },
    findTargetsForRef(refId, options) {
      const targets = refToTargets.get(refId) ?? [];
      return filterByCertainty(targets, options);
    },
  };
}

function toReferenceSite(
  refNode: RefNode,
  selectorNode: SelectorNode,
  reason: EdgeReason,
  certainty: EdgeCertainty,
): SemanticReferenceSite {
  return {
    refId: refNode.id,
    selectorId: selectorNode.id,
    filePath: refNode.filePath,
    uri: pathToFileURL(refNode.filePath).href,
    range: refNode.range,
    origin: refNode.origin,
    scssModulePath: refNode.scssModulePath,
    selectorFilePath: selectorNode.filePath,
    canonicalName: selectorNode.canonicalName,
    className: refNode.className ?? selectorNode.canonicalName,
    certainty,
    reason,
    expansion: certainty === "exact" ? "direct" : "expanded",
  };
}

function filterByCertainty<T extends { readonly certainty: EdgeCertainty }>(
  entries: readonly T[],
  options: ReferenceQueryOptions | undefined,
): readonly T[] {
  const minimumCertainty = options?.minimumCertainty;
  if (!minimumCertainty) return entries;
  const minimumRank = rankCertainty(minimumCertainty);
  return entries.filter((entry) => rankCertainty(entry.certainty) >= minimumRank);
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
    return;
  }
  map.set(key, [value]);
}

function selectorKeyFor(filePath: string, canonicalName: string): string {
  return `${filePath}::${canonicalName}`;
}

function isRefNode(node: SemanticNode | undefined): node is RefNode {
  return node?.kind === "ref";
}

function isSelectorNode(node: SemanticNode | undefined): node is SelectorNode {
  return node?.kind === "selector";
}
