import type { SemanticContributionDeps, SemanticModuleUsageSite } from "./reference-collector";
import { filterSelectorReferencePolicy } from "./reference-policy";
import { type ReferenceQueryOptions, type SemanticReferenceSite } from "./reference-types";
import {
  NullSemanticReferenceDependencies,
  type ReferenceDependencyContribution,
  type SemanticReferenceDependencyLookup,
  WorkspaceSemanticReferenceDependencies,
} from "./reference-dependencies";

export interface SemanticWorkspaceReferenceIndex {
  readonly dependencies: SemanticReferenceDependencyLookup;
  record(
    uri: string,
    sites: readonly SemanticReferenceSite[],
    moduleUsages?: readonly SemanticModuleUsageSite[],
    deps?: SemanticContributionDeps,
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
  findUrisBySettingsDependency(workspaceRoot: string, settingsKey: string): readonly string[];
  findUrisBySourceDependency(workspaceRoot: string, sourcePath: string): readonly string[];
  clear(): void;
}

export class NullSemanticWorkspaceReferenceIndex implements SemanticWorkspaceReferenceIndex {
  readonly dependencies = new NullSemanticReferenceDependencies();
  record(
    _uri: string,
    _sites: readonly SemanticReferenceSite[],
    _moduleUsages?: readonly SemanticModuleUsageSite[],
    _deps?: SemanticContributionDeps,
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
  findUrisBySettingsDependency(_workspaceRoot: string, _settingsKey: string): readonly string[] {
    return [];
  }
  findUrisBySourceDependency(_workspaceRoot: string, _sourcePath: string): readonly string[] {
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
    ReferenceDependencyContribution & {
      readonly referenceSites: readonly SemanticReferenceSite[];
      readonly order: number;
    }
  >();
  readonly dependencies = new WorkspaceSemanticReferenceDependencies();
  private readonly selectorToSites = new Map<
    string,
    Map<string, { readonly order: number; readonly sites: readonly SemanticReferenceSite[] }>
  >();
  private readonly scssToSites = new Map<
    string,
    Map<string, { readonly order: number; readonly sites: readonly SemanticReferenceSite[] }>
  >();
  private nextOrder = 0;

  record(
    uri: string,
    sites: readonly SemanticReferenceSite[],
    moduleUsages: readonly SemanticModuleUsageSite[] = [],
    deps: SemanticContributionDeps = {
      workspaceRoot: "",
      settingsKey: "",
      stylePaths: [],
      sourcePaths: [],
    },
  ): void {
    const previous = this.contributions.get(uri);
    if (previous) {
      this.removeContribution(uri, previous);
      this.contributions.delete(uri);
    }

    if (sites.length === 0 && moduleUsages.length === 0) {
      return;
    }

    const next = {
      referenceSites: sites,
      moduleUsages,
      deps,
      order: previous?.order ?? this.nextOrder++,
    };
    this.contributions.set(uri, next);
    this.addContribution(uri, next);
  }

  forget(uri: string): void {
    const previous = this.contributions.get(uri);
    if (!previous) return;
    this.contributions.delete(uri);
    this.removeContribution(uri, previous);
  }

  findSelectorReferences(
    scssPath: string,
    canonicalName: string,
    options?: ReferenceQueryOptions,
  ): readonly SemanticReferenceSite[] {
    const sites = flattenSiteBuckets(
      this.selectorToSites.get(selectorKeyFor(scssPath, canonicalName)),
    );
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
    const sites = flattenSiteBuckets(this.scssToSites.get(scssPath));
    return filterSites(sites, options);
  }

  findModuleUsages(scssPath: string): readonly SemanticModuleUsageSite[] {
    return this.dependencies.findModuleUsages(scssPath);
  }

  findReferencingUris(scssPath: string): readonly string[] {
    return this.dependencies.findReferencingUris(scssPath);
  }

  findUrisBySettingsDependency(workspaceRoot: string, settingsKey: string): readonly string[] {
    return this.dependencies.findUrisBySettingsDependency(workspaceRoot, settingsKey);
  }

  findUrisBySourceDependency(workspaceRoot: string, sourcePath: string): readonly string[] {
    return this.dependencies.findUrisBySourceDependency(workspaceRoot, sourcePath);
  }

  clear(): void {
    this.contributions.clear();
    this.selectorToSites.clear();
    this.scssToSites.clear();
    this.dependencies.clear();
    this.nextOrder = 0;
  }

  private addContribution(
    uri: string,
    contribution: ReferenceDependencyContribution & {
      readonly referenceSites: readonly SemanticReferenceSite[];
      readonly order: number;
    },
  ): void {
    const selectorGroups = groupSitesByKey(contribution.referenceSites, (site) =>
      selectorKeyFor(site.selectorFilePath, site.canonicalName),
    );
    for (const [key, sites] of selectorGroups.entries()) {
      getOrCreateNestedMap(this.selectorToSites, key).set(uri, {
        order: contribution.order,
        sites,
      });
    }

    const scssGroups = groupSitesByKey(
      contribution.referenceSites,
      (site) => site.selectorFilePath,
    );
    for (const [key, sites] of scssGroups.entries()) {
      getOrCreateNestedMap(this.scssToSites, key).set(uri, {
        order: contribution.order,
        sites,
      });
    }

    this.dependencies.record(uri, contribution, contribution.order);
  }

  private removeContribution(
    uri: string,
    contribution: ReferenceDependencyContribution & {
      readonly referenceSites: readonly SemanticReferenceSite[];
    },
  ): void {
    const selectorGroups = groupSitesByKey(contribution.referenceSites, (site) =>
      selectorKeyFor(site.selectorFilePath, site.canonicalName),
    );
    for (const key of selectorGroups.keys()) {
      removeFromNestedMap(this.selectorToSites, key, uri);
    }

    const scssGroups = groupSitesByKey(
      contribution.referenceSites,
      (site) => site.selectorFilePath,
    );
    for (const key of scssGroups.keys()) {
      removeFromNestedMap(this.scssToSites, key, uri);
    }

    this.dependencies.forget(uri, contribution);
  }
}

function selectorKeyFor(filePath: string, canonicalName: string): string {
  return `${filePath}::${canonicalName}`;
}

function groupSitesByKey(
  sites: readonly SemanticReferenceSite[],
  getKey: (site: SemanticReferenceSite) => string,
): ReadonlyMap<string, readonly SemanticReferenceSite[]> {
  const grouped = new Map<string, SemanticReferenceSite[]>();
  for (const site of sites) {
    const key = getKey(site);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(site);
      continue;
    }
    grouped.set(key, [site]);
  }
  return grouped;
}

function flattenSiteBuckets(
  buckets:
    | ReadonlyMap<
        string,
        { readonly order: number; readonly sites: readonly SemanticReferenceSite[] }
      >
    | undefined,
): readonly SemanticReferenceSite[] {
  if (!buckets) return [];
  return [...buckets.values()]
    .toSorted((a, b) => a.order - b.order)
    .flatMap((bucket) => bucket.sites);
}

function getOrCreateNestedMap<K, I, V>(map: Map<K, Map<I, V>>, key: K): Map<I, V> {
  const existing = map.get(key);
  if (existing) return existing;
  const next = new Map<I, V>();
  map.set(key, next);
  return next;
}

function removeFromNestedMap<K, I, V>(map: Map<K, Map<I, V>>, key: K, itemKey: I): void {
  const bucket = map.get(key);
  if (!bucket) return;
  bucket.delete(itemKey);
  if (bucket.size === 0) {
    map.delete(key);
  }
}

function filterSites(
  sites: readonly SemanticReferenceSite[],
  options?: ReferenceQueryOptions,
): readonly SemanticReferenceSite[] {
  return filterSelectorReferencePolicy(sites, options);
}
