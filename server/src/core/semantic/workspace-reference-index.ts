import type { AnalysisEntry } from "../indexing/document-analysis-cache";
import type { StyleDocumentHIR } from "../hir/style-types";
import type { TypeResolver } from "../ts/type-resolver";
import { buildSourceSemanticGraph } from "./graph-builder";
import {
  buildSemanticReferenceIndex,
  type ReferenceQueryOptions,
  type SemanticReferenceSite,
} from "./reference-index";

export interface SemanticReferenceCollectionContext {
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly workspaceRoot: string;
  readonly filePath: string;
}

export interface SemanticWorkspaceReferenceIndex {
  record(uri: string, sites: readonly SemanticReferenceSite[]): void;
  forget(uri: string): void;
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
  clear(): void;
}

export class NullSemanticWorkspaceReferenceIndex implements SemanticWorkspaceReferenceIndex {
  record(_uri: string, _sites: readonly SemanticReferenceSite[]): void {}
  forget(_uri: string): void {}
  findSelectorReferences(
    _scssPath: string,
    _canonicalName: string,
    _options?: ReferenceQueryOptions,
  ): readonly SemanticReferenceSite[] {
    return [];
  }
  countSelectorReferences(
    _scssPath: string,
    _canonicalName: string,
    _options?: ReferenceQueryOptions,
  ): number {
    return 0;
  }
  findAllForScssPath(
    _scssPath: string,
    _options?: ReferenceQueryOptions,
  ): readonly SemanticReferenceSite[] {
    return [];
  }
  clear(): void {}
}

/**
 * Workspace-scope semantic reference index.
 *
 * This is a transitional Wave 2 structure. It keeps per-document
 * contributions and rebuilds the selector/scss lookup tables on
 * every record/forget. That is intentionally simple: correctness
 * matters more than incremental optimality while the graph-backed
 * read path is being introduced.
 */
export class WorkspaceSemanticWorkspaceReferenceIndex implements SemanticWorkspaceReferenceIndex {
  private readonly contributions = new Map<string, readonly SemanticReferenceSite[]>();
  private readonly selectorToSites = new Map<string, readonly SemanticReferenceSite[]>();
  private readonly scssToSites = new Map<string, readonly SemanticReferenceSite[]>();

  record(uri: string, sites: readonly SemanticReferenceSite[]): void {
    if (sites.length === 0) {
      this.contributions.delete(uri);
    } else {
      this.contributions.set(uri, sites);
    }
    this.rebuild();
  }

  forget(uri: string): void {
    if (!this.contributions.delete(uri)) return;
    this.rebuild();
  }

  findSelectorReferences(
    scssPath: string,
    canonicalName: string,
    options?: ReferenceQueryOptions,
  ): readonly SemanticReferenceSite[] {
    const sites = this.selectorToSites.get(selectorKeyFor(scssPath, canonicalName)) ?? [];
    return filterSites(sites, options);
  }

  countSelectorReferences(
    scssPath: string,
    canonicalName: string,
    options?: ReferenceQueryOptions,
  ): number {
    return this.findSelectorReferences(scssPath, canonicalName, options).length;
  }

  findAllForScssPath(
    scssPath: string,
    options?: ReferenceQueryOptions,
  ): readonly SemanticReferenceSite[] {
    const sites = this.scssToSites.get(scssPath) ?? [];
    return filterSites(sites, options);
  }

  clear(): void {
    this.contributions.clear();
    this.selectorToSites.clear();
    this.scssToSites.clear();
  }

  private rebuild(): void {
    this.selectorToSites.clear();
    this.scssToSites.clear();
    for (const sites of this.contributions.values()) {
      for (const site of sites) {
        push(this.selectorToSites, selectorKeyFor(site.selectorFilePath, site.canonicalName), site);
        push(this.scssToSites, site.selectorFilePath, site);
      }
    }
  }
}

export function collectSemanticReferenceSites(
  uri: string,
  entry: AnalysisEntry,
  ctx: SemanticReferenceCollectionContext,
): readonly SemanticReferenceSite[] {
  const styleDocumentsByPath = new Map<string, StyleDocumentHIR>();

  for (const styleImport of entry.sourceDocument.styleImports) {
    if (styleImport.resolved.kind !== "resolved") continue;
    const styleDocument = ctx.styleDocumentForPath(styleImport.resolved.absolutePath);
    if (styleDocument) {
      styleDocumentsByPath.set(styleImport.resolved.absolutePath, styleDocument);
    }
  }

  for (const expr of entry.sourceDocument.classExpressions) {
    if (styleDocumentsByPath.has(expr.scssModulePath)) continue;
    const styleDocument = ctx.styleDocumentForPath(expr.scssModulePath);
    if (styleDocument) {
      styleDocumentsByPath.set(expr.scssModulePath, styleDocument);
    }
  }

  if (styleDocumentsByPath.size === 0) return [];

  const graph = buildSourceSemanticGraph({
    sourceDocument: entry.sourceDocument,
    styleDocumentsByPath,
    resolveSymbolValues(ref) {
      const resolved = ctx.typeResolver.resolve(ctx.filePath, ref.rawReference, ctx.workspaceRoot);
      return resolved.kind === "union" ? resolved.values : [];
    },
  });

  const index = buildSemanticReferenceIndex(graph);
  return index
    .listReferenceSites()
    .filter((site) => site.uri === uri)
    .toSorted((a, b) => compareSites(a, b));
}

function compareSites(a: SemanticReferenceSite, b: SemanticReferenceSite): number {
  return (
    a.selectorFilePath.localeCompare(b.selectorFilePath) ||
    a.canonicalName.localeCompare(b.canonicalName) ||
    a.range.start.line - b.range.start.line ||
    a.range.start.character - b.range.start.character ||
    a.refId.localeCompare(b.refId)
  );
}

function selectorKeyFor(filePath: string, canonicalName: string): string {
  return `${filePath}::${canonicalName}`;
}

function push(
  map: Map<string, readonly SemanticReferenceSite[]>,
  key: string,
  value: SemanticReferenceSite,
): void {
  const existing = map.get(key);
  if (existing) {
    map.set(key, [...existing, value]);
    return;
  }
  map.set(key, [value]);
}

function filterSites(
  sites: readonly SemanticReferenceSite[],
  options?: ReferenceQueryOptions,
): readonly SemanticReferenceSite[] {
  const minimumCertainty = options?.minimumCertainty;
  if (!minimumCertainty) return sites;
  return sites.filter((site) => {
    switch (minimumCertainty) {
      case "exact":
        return site.certainty === "exact";
      case "inferred":
        return site.certainty === "exact" || site.certainty === "inferred";
      case "possible":
        return true;
      default:
        minimumCertainty satisfies never;
        return minimumCertainty;
    }
  });
}
