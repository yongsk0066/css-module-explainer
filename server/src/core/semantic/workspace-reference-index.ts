import type { AnalysisEntry } from "../indexing/document-analysis-cache";
import type { StyleDocumentHIR } from "../hir/style-types";
import type { TypeResolver } from "../ts/type-resolver";
import { buildSourceSemanticGraph } from "./graph-builder";
import type { RefNode } from "./graph-types";
import {
  buildSemanticReferenceIndex,
  type ReferenceQueryOptions,
  type SemanticReferenceSite,
} from "./reference-index";
import { resolveSymbolExpressionValues } from "./resolve-symbol-values";

export interface SemanticReferenceCollectionContext {
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly workspaceRoot: string;
  readonly filePath: string;
}

export interface SemanticModuleUsageSite {
  readonly refId: string;
  readonly uri: string;
  readonly filePath: string;
  readonly range: SemanticReferenceSite["range"];
  readonly origin: SemanticReferenceSite["origin"];
  readonly scssModulePath: string;
  readonly expressionKind: RefNode["expressionKind"];
  readonly hasResolvedTargets: boolean;
  readonly isDynamic: boolean;
}

export interface SemanticWorkspaceReferenceIndex {
  record(
    uri: string,
    sites: readonly SemanticReferenceSite[],
    moduleUsages?: readonly SemanticModuleUsageSite[],
  ): void;
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
  findModuleUsages(scssPath: string): readonly SemanticModuleUsageSite[];
  findReferencingUris(scssPath: string): readonly string[];
  clear(): void;
}

export class NullSemanticWorkspaceReferenceIndex implements SemanticWorkspaceReferenceIndex {
  record(
    _uri: string,
    _sites: readonly SemanticReferenceSite[],
    _moduleUsages?: readonly SemanticModuleUsageSite[],
  ): void {}
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
  findModuleUsages(_scssPath: string): readonly SemanticModuleUsageSite[] {
    return [];
  }
  findReferencingUris(_scssPath: string): readonly string[] {
    return [];
  }
  clear(): void {}
}

/**
 * Workspace-scope semantic reference index.
 *
 * This keeps per-document contributions and rebuilds the
 * selector/scss lookup tables on every record/forget. The rebuild
 * strategy is intentionally simple so the graph-backed read path
 * stays easy to validate while it is still running alongside the
 * legacy index.
 */
export class WorkspaceSemanticWorkspaceReferenceIndex implements SemanticWorkspaceReferenceIndex {
  private readonly contributions = new Map<
    string,
    {
      readonly referenceSites: readonly SemanticReferenceSite[];
      readonly moduleUsages: readonly SemanticModuleUsageSite[];
    }
  >();
  private readonly selectorToSites = new Map<string, readonly SemanticReferenceSite[]>();
  private readonly scssToSites = new Map<string, readonly SemanticReferenceSite[]>();
  private readonly scssToModuleUsages = new Map<string, readonly SemanticModuleUsageSite[]>();

  record(
    uri: string,
    sites: readonly SemanticReferenceSite[],
    moduleUsages: readonly SemanticModuleUsageSite[] = [],
  ): void {
    if (sites.length === 0 && moduleUsages.length === 0) {
      this.contributions.delete(uri);
    } else {
      this.contributions.set(uri, { referenceSites: sites, moduleUsages });
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

  findModuleUsages(scssPath: string): readonly SemanticModuleUsageSite[] {
    return this.scssToModuleUsages.get(scssPath) ?? [];
  }

  findReferencingUris(scssPath: string): readonly string[] {
    const uris = new Set<string>();
    for (const usage of this.findModuleUsages(scssPath)) {
      uris.add(usage.uri);
    }
    return [...uris].toSorted();
  }

  clear(): void {
    this.contributions.clear();
    this.selectorToSites.clear();
    this.scssToSites.clear();
    this.scssToModuleUsages.clear();
  }

  private rebuild(): void {
    this.selectorToSites.clear();
    this.scssToSites.clear();
    this.scssToModuleUsages.clear();
    for (const contribution of this.contributions.values()) {
      for (const site of contribution.referenceSites) {
        push(this.selectorToSites, selectorKeyFor(site.selectorFilePath, site.canonicalName), site);
        push(this.scssToSites, site.selectorFilePath, site);
      }
      for (const usage of contribution.moduleUsages) {
        push(this.scssToModuleUsages, usage.scssModulePath, usage);
      }
    }
  }
}

export function collectSemanticReferenceContribution(
  uri: string,
  entry: AnalysisEntry,
  ctx: SemanticReferenceCollectionContext,
): {
  readonly referenceSites: readonly SemanticReferenceSite[];
  readonly moduleUsages: readonly SemanticModuleUsageSite[];
} {
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

  if (styleDocumentsByPath.size === 0) {
    return { referenceSites: [], moduleUsages: [] };
  }

  const graph = buildSourceSemanticGraph({
    sourceDocument: entry.sourceDocument,
    styleDocumentsByPath,
    resolveSymbolValues(ref) {
      return resolveSymbolExpressionValues(entry.sourceFile, ref, ctx);
    },
  });

  const index = buildSemanticReferenceIndex(graph);
  const referenceSites = index
    .listReferenceSites()
    .filter((site) => site.uri === uri)
    .toSorted((a, b) => compareSites(a, b));
  const moduleUsages = entry.sourceDocument.classExpressions
    .map((expr) => {
      const targets = index.findTargetsForRef(expr.id);
      return {
        refId: expr.id,
        uri,
        filePath: ctx.filePath,
        range: expr.range,
        origin: expr.origin,
        scssModulePath: expr.scssModulePath,
        expressionKind: expr.kind,
        hasResolvedTargets: targets.length > 0,
        isDynamic: expr.kind === "template" || expr.kind === "symbolRef",
      } satisfies SemanticModuleUsageSite;
    })
    .toSorted((a, b) => compareModuleUsages(a, b));
  return { referenceSites, moduleUsages };
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

function compareModuleUsages(a: SemanticModuleUsageSite, b: SemanticModuleUsageSite): number {
  return (
    a.scssModulePath.localeCompare(b.scssModulePath) ||
    a.range.start.line - b.range.start.line ||
    a.range.start.character - b.range.start.character ||
    a.refId.localeCompare(b.refId)
  );
}

function selectorKeyFor(filePath: string, canonicalName: string): string {
  return `${filePath}::${canonicalName}`;
}

function push<T>(map: Map<string, readonly T[]>, key: string, value: T): void {
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
