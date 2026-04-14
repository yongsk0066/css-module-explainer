import type { SemanticContributionDeps, SemanticModuleUsageSite } from "./reference-collector";

export interface ReferenceDependencyContribution {
  readonly moduleUsages: readonly SemanticModuleUsageSite[];
  readonly deps: SemanticContributionDeps;
}

export interface SemanticReferenceDependencyLookup {
  findModuleUsages(scssPath: string): readonly SemanticModuleUsageSite[];
  findReferencingUris(scssPath: string): readonly string[];
  findUrisBySettingsDependency(workspaceRoot: string, settingsKey: string): readonly string[];
  findUrisBySourceDependency(workspaceRoot: string, sourcePath: string): readonly string[];
  clear(): void;
}

export interface SemanticReferenceDependencyStore extends SemanticReferenceDependencyLookup {
  rebuild(contributions: ReadonlyMap<string, ReferenceDependencyContribution>): void;
  record(uri: string, contribution: ReferenceDependencyContribution, order: number): void;
  forget(uri: string, contribution: ReferenceDependencyContribution): void;
}

export class NullSemanticReferenceDependencies implements SemanticReferenceDependencyLookup {
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

export class WorkspaceSemanticReferenceDependencies implements SemanticReferenceDependencyStore {
  private readonly scssToModuleUsages = new Map<
    string,
    Map<string, { readonly order: number; readonly usages: readonly SemanticModuleUsageSite[] }>
  >();
  private readonly settingsDependencyToUris = new Map<string, Map<string, number>>();
  private readonly sourceDependencyToUris = new Map<string, Map<string, number>>();

  rebuild(contributions: ReadonlyMap<string, ReferenceDependencyContribution>): void {
    this.scssToModuleUsages.clear();
    this.settingsDependencyToUris.clear();
    this.sourceDependencyToUris.clear();

    let order = 0;
    for (const [uri, contribution] of contributions.entries()) {
      this.record(uri, contribution, order++);
    }
  }

  record(uri: string, contribution: ReferenceDependencyContribution, order: number): void {
    const moduleUsagesByPath = groupModuleUsagesByScssPath(contribution.moduleUsages);
    for (const [scssPath, usages] of moduleUsagesByPath.entries()) {
      getOrCreateNestedMap(this.scssToModuleUsages, scssPath).set(uri, { order, usages });
    }

    getOrCreateNestedMap(
      this.settingsDependencyToUris,
      settingsDependencyKey(contribution.deps.workspaceRoot, contribution.deps.settingsKey),
    ).set(uri, order);

    for (const sourcePath of contribution.deps.sourcePaths) {
      getOrCreateNestedMap(
        this.sourceDependencyToUris,
        sourceDependencyKey(contribution.deps.workspaceRoot, sourcePath),
      ).set(uri, order);
    }
  }

  forget(uri: string, contribution: ReferenceDependencyContribution): void {
    const moduleUsagesByPath = groupModuleUsagesByScssPath(contribution.moduleUsages);
    for (const scssPath of moduleUsagesByPath.keys()) {
      removeFromNestedMap(this.scssToModuleUsages, scssPath, uri);
    }

    removeFromNestedMap(
      this.settingsDependencyToUris,
      settingsDependencyKey(contribution.deps.workspaceRoot, contribution.deps.settingsKey),
      uri,
    );

    for (const sourcePath of contribution.deps.sourcePaths) {
      removeFromNestedMap(
        this.sourceDependencyToUris,
        sourceDependencyKey(contribution.deps.workspaceRoot, sourcePath),
        uri,
      );
    }
  }

  findModuleUsages(scssPath: string): readonly SemanticModuleUsageSite[] {
    const buckets = this.scssToModuleUsages.get(scssPath);
    if (!buckets) return [];
    return [...buckets.values()]
      .toSorted((a, b) => a.order - b.order)
      .flatMap((bucket) => bucket.usages);
  }

  findReferencingUris(scssPath: string): readonly string[] {
    const buckets = this.scssToModuleUsages.get(scssPath);
    if (!buckets) return [];
    return [...buckets.keys()].toSorted();
  }

  findUrisBySettingsDependency(workspaceRoot: string, settingsKey: string): readonly string[] {
    return orderedUris(
      this.settingsDependencyToUris.get(settingsDependencyKey(workspaceRoot, settingsKey)),
    );
  }

  findUrisBySourceDependency(workspaceRoot: string, sourcePath: string): readonly string[] {
    return orderedUris(
      this.sourceDependencyToUris.get(sourceDependencyKey(workspaceRoot, sourcePath)),
    );
  }

  clear(): void {
    this.scssToModuleUsages.clear();
    this.settingsDependencyToUris.clear();
    this.sourceDependencyToUris.clear();
  }
}

function settingsDependencyKey(workspaceRoot: string, settingsKey: string): string {
  return `${workspaceRoot}::${settingsKey}`;
}

function sourceDependencyKey(workspaceRoot: string, sourcePath: string): string {
  return `${workspaceRoot}::${sourcePath}`;
}

function groupModuleUsagesByScssPath(
  moduleUsages: readonly SemanticModuleUsageSite[],
): ReadonlyMap<string, readonly SemanticModuleUsageSite[]> {
  const grouped = new Map<string, SemanticModuleUsageSite[]>();
  for (const usage of moduleUsages) {
    const existing = grouped.get(usage.scssModulePath);
    if (existing) {
      existing.push(usage);
      continue;
    }
    grouped.set(usage.scssModulePath, [usage]);
  }
  return grouped;
}

function orderedUris(buckets: ReadonlyMap<string, number> | undefined): readonly string[] {
  if (!buckets) return [];
  return [...buckets.entries()]
    .toSorted((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([uri]) => uri);
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
