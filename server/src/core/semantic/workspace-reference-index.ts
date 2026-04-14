import type { SemanticContributionDeps, SemanticModuleUsageSite } from "./reference-collector";
import { filterSelectorReferencePolicy } from "./reference-policy";
import { type ReferenceQueryOptions, type SemanticReferenceSite } from "./reference-types";

export interface SemanticWorkspaceReferenceIndex {
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
    {
      readonly referenceSites: readonly SemanticReferenceSite[];
      readonly moduleUsages: readonly SemanticModuleUsageSite[];
      readonly deps: SemanticContributionDeps;
    }
  >();
  private readonly selectorToSites = new Map<string, readonly SemanticReferenceSite[]>();
  private readonly scssToSites = new Map<string, readonly SemanticReferenceSite[]>();
  private readonly scssToModuleUsages = new Map<string, readonly SemanticModuleUsageSite[]>();
  private readonly settingsDependencyToUris = new Map<string, readonly string[]>();
  private readonly sourceDependencyToUris = new Map<string, readonly string[]>();

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
    if (sites.length === 0 && moduleUsages.length === 0) {
      this.contributions.delete(uri);
    } else {
      this.contributions.set(uri, { referenceSites: sites, moduleUsages, deps });
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

  findUrisBySettingsDependency(workspaceRoot: string, settingsKey: string): readonly string[] {
    return (
      this.settingsDependencyToUris.get(settingsDependencyKey(workspaceRoot, settingsKey)) ?? []
    );
  }

  findUrisBySourceDependency(workspaceRoot: string, sourcePath: string): readonly string[] {
    return this.sourceDependencyToUris.get(sourceDependencyKey(workspaceRoot, sourcePath)) ?? [];
  }

  clear(): void {
    this.contributions.clear();
    this.selectorToSites.clear();
    this.scssToSites.clear();
    this.scssToModuleUsages.clear();
    this.settingsDependencyToUris.clear();
    this.sourceDependencyToUris.clear();
  }

  private rebuild(): void {
    this.selectorToSites.clear();
    this.scssToSites.clear();
    this.scssToModuleUsages.clear();
    this.settingsDependencyToUris.clear();
    this.sourceDependencyToUris.clear();
    for (const [uri, contribution] of this.contributions.entries()) {
      for (const site of contribution.referenceSites) {
        push(this.selectorToSites, selectorKeyFor(site.selectorFilePath, site.canonicalName), site);
        push(this.scssToSites, site.selectorFilePath, site);
      }
      for (const usage of contribution.moduleUsages) {
        push(this.scssToModuleUsages, usage.scssModulePath, usage);
      }
      push(
        this.settingsDependencyToUris,
        settingsDependencyKey(contribution.deps.workspaceRoot, contribution.deps.settingsKey),
        uri,
      );
      for (const sourcePath of contribution.deps.sourcePaths) {
        push(
          this.sourceDependencyToUris,
          sourceDependencyKey(contribution.deps.workspaceRoot, sourcePath),
          uri,
        );
      }
    }
  }
}

function selectorKeyFor(filePath: string, canonicalName: string): string {
  return `${filePath}::${canonicalName}`;
}

function settingsDependencyKey(workspaceRoot: string, settingsKey: string): string {
  return `${workspaceRoot}::${settingsKey}`;
}

function sourceDependencyKey(workspaceRoot: string, sourcePath: string): string {
  return `${workspaceRoot}::${sourcePath}`;
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
  return filterSelectorReferencePolicy(sites, options);
}
