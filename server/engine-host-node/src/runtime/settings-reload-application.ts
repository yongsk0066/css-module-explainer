import type { ResourceSettings, WindowSettings } from "../../../engine-core-ts/src/settings";
import { mergeSettings, resourceSettingsDependencyKey } from "../../../engine-core-ts/src/settings";
import type { WorkspaceRegistry } from "../workspace/workspace-registry";
import { createRuntimeDependencySnapshot, snapshotOpenDocuments } from "./dependency-snapshot";
import { planSettingsReload } from "./invalidation-planner";

export interface SettingsReloadDocuments {
  all(): readonly { readonly uri: string }[];
}

export interface ResourceSettingsByWorkspaceFolder {
  readonly workspaceFolderUri: string;
  readonly resourceSettings: ResourceSettings;
}

export interface ApplySettingsReloadArgs {
  readonly registry: WorkspaceRegistry;
  readonly documents: SettingsReloadDocuments;
  readonly windowSettings: WindowSettings;
  readonly resourceSettingsByWorkspaceFolder: readonly ResourceSettingsByWorkspaceFolder[];
}

export interface SettingsReloadApplicationResult {
  readonly scheduledDiagnostics: readonly {
    readonly uri: string;
    readonly kind: "style" | "source";
  }[];
}

export function applySettingsReload(
  args: ApplySettingsReloadArgs,
): SettingsReloadApplicationResult {
  const bundles = args.registry.allDeps();
  const snapshot = createRuntimeDependencySnapshot(
    bundles,
    snapshotOpenDocuments({
      documents: args.documents,
      getWorkspaceRoot: (uri) => args.registry.getDeps(uri)?.workspaceRoot ?? null,
    }),
  );
  const settingsByWorkspaceFolder = new Map(
    args.resourceSettingsByWorkspaceFolder.map((entry) => [
      entry.workspaceFolderUri,
      entry.resourceSettings,
    ]),
  );

  const workspaceChanges = [];
  for (const deps of bundles) {
    const resourceSettings = settingsByWorkspaceFolder.get(deps.workspaceFolderUri);
    if (!resourceSettings) continue;

    const nextSettings = mergeSettings(args.windowSettings, resourceSettings);
    const prevSettings = deps.settings;
    const prevSettingsKey = resourceSettingsDependencyKey(prevSettings);
    const nextSettingsKey = resourceSettingsDependencyKey(nextSettings);
    const aliasChanged = !shallowEqualPathAlias(prevSettings.pathAlias, nextSettings.pathAlias);
    const modeChanged =
      prevSettings.scss.classnameTransform !== nextSettings.scss.classnameTransform;
    const settingsKeyChanged = prevSettingsKey !== nextSettingsKey;
    deps.settings = nextSettings;
    if (aliasChanged || modeChanged || settingsKeyChanged) {
      deps.clearStyleSemanticGraphCache?.();
    }

    workspaceChanges.push({
      workspaceRoot: deps.workspaceRoot,
      aliasChanged,
      modeChanged,
      settingsKeyChanged,
      affectedSettingsDependencyUris: snapshot.findSettingsDependencyUris(
        deps.workspaceRoot,
        prevSettingsKey,
      ),
    });
  }

  const plan = planSettingsReload(workspaceChanges, snapshot.openDocuments);
  for (const deps of bundles) {
    if (!plan.aliasRebuildRoots.includes(deps.workspaceRoot)) continue;
    deps.rebuildAliasResolver(deps.settings.pathAlias);
  }

  const scheduledDiagnostics: Array<{
    readonly uri: string;
    readonly kind: "style" | "source";
  }> = [];
  if (plan.resourceChanged) {
    for (const uri of plan.affectedSourceUris) {
      const deps = args.registry.getDeps(uri);
      if (!deps) continue;
      deps.semanticReferenceIndex.forget(uri);
      deps.analysisCache.invalidate(uri);
      deps.clearStyleSemanticGraphCache?.();
    }
    bundles[0]?.refreshCodeLens();
    for (const doc of snapshot.openDocuments) {
      if (doc.isStyle) {
        if (doc.workspaceRoot !== null && plan.affectedStyleRoots.includes(doc.workspaceRoot)) {
          scheduledDiagnostics.push({ uri: doc.uri, kind: "style" });
        }
        continue;
      }
      if (plan.affectedSourceUris.includes(doc.uri)) {
        scheduledDiagnostics.push({ uri: doc.uri, kind: "source" });
      }
    }
  }

  return {
    scheduledDiagnostics,
  };
}

function shallowEqualPathAlias(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
