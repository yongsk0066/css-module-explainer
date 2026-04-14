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
  private readonly scssToModuleUsages = new Map<string, readonly SemanticModuleUsageSite[]>();
  private readonly settingsDependencyToUris = new Map<string, readonly string[]>();
  private readonly sourceDependencyToUris = new Map<string, readonly string[]>();

  rebuild(contributions: ReadonlyMap<string, ReferenceDependencyContribution>): void {
    this.scssToModuleUsages.clear();
    this.settingsDependencyToUris.clear();
    this.sourceDependencyToUris.clear();

    for (const [uri, contribution] of contributions.entries()) {
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

function push<T>(map: Map<string, readonly T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) {
    map.set(key, [...existing, value]);
    return;
  }
  map.set(key, [value]);
}
