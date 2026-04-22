import type { ParsedResourceSettings, WindowSettings } from "../../../engine-core-ts/src/settings";
import {
  mergeSettings,
  resourceSettingsDependencyKey,
  shouldWarnCompatPathAlias,
} from "../../../engine-core-ts/src/settings";
import type { WorkspaceRegistry } from "../workspace/workspace-registry";
import { createRuntimeDependencySnapshot, snapshotOpenDocuments } from "./dependency-snapshot";
import { planSettingsReload } from "./invalidation-planner";

export interface SettingsReloadDocuments {
  all(): readonly { readonly uri: string }[];
}

export interface ResourceSettingsByWorkspaceFolder {
  readonly workspaceFolderUri: string;
  readonly resourceSettingsInfo: ParsedResourceSettings;
}

export interface ApplySettingsReloadArgs {
  readonly registry: WorkspaceRegistry;
  readonly documents: SettingsReloadDocuments;
  readonly windowSettings: WindowSettings;
  readonly warnedCompatPathAliasRoots: ReadonlySet<string>;
  readonly resourceSettingsByWorkspaceFolder: readonly ResourceSettingsByWorkspaceFolder[];
}

export interface SettingsReloadApplicationResult {
  readonly scheduledDiagnostics: readonly {
    readonly uri: string;
    readonly kind: "style" | "source";
  }[];
  readonly warningWorkspaceRoots: readonly string[];
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
  const infoByWorkspaceFolder = new Map(
    args.resourceSettingsByWorkspaceFolder.map((entry) => [
      entry.workspaceFolderUri,
      entry.resourceSettingsInfo,
    ]),
  );

  const warningWorkspaceRoots = new Set<string>();
  const workspaceChanges = [];
  for (const deps of bundles) {
    const resourceSettingsInfo = infoByWorkspaceFolder.get(deps.workspaceFolderUri);
    if (!resourceSettingsInfo) continue;

    const nextSettings = mergeSettings(args.windowSettings, resourceSettingsInfo.settings);
    const prevSettings = deps.settings;
    const prevSettingsKey = resourceSettingsDependencyKey(prevSettings);
    const nextSettingsKey = resourceSettingsDependencyKey(nextSettings);
    deps.settings = nextSettings;

    if (
      shouldWarnCompatPathAlias(
        resourceSettingsInfo,
        args.warnedCompatPathAliasRoots,
        deps.workspaceRoot,
      )
    ) {
      warningWorkspaceRoots.add(deps.workspaceRoot);
    }

    workspaceChanges.push({
      workspaceRoot: deps.workspaceRoot,
      aliasChanged: !shallowEqualPathAlias(prevSettings.pathAlias, nextSettings.pathAlias),
      modeChanged: prevSettings.scss.classnameTransform !== nextSettings.scss.classnameTransform,
      settingsKeyChanged: prevSettingsKey !== nextSettingsKey,
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
    warningWorkspaceRoots: [...warningWorkspaceRoots].toSorted(),
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
