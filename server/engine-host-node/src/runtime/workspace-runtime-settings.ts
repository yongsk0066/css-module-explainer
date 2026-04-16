import type { AliasResolver } from "../../../src/core/cx/alias-resolver";
import { AliasResolverHolder } from "../../../src/core/cx/alias-resolver";
import {
  resourceSettingsDependencyKey,
  DEFAULT_SETTINGS,
  type Settings,
} from "../../../src/settings";

export interface WorkspaceRuntimeSettingsState {
  readonly workspaceRoot: string;
  readonly aliasResolver: AliasResolver;
  readonly settingsKey: string;
  readonly classnameTransform: Settings["scss"]["classnameTransform"];
  get(): Settings;
  set(next: Settings): void;
  rebuildAliasResolver(pathAlias: Readonly<Record<string, string>>): void;
}

export function createWorkspaceRuntimeSettingsState(
  workspaceRoot: string,
): WorkspaceRuntimeSettingsState {
  let currentSettings = DEFAULT_SETTINGS;
  const aliasHolder = new AliasResolverHolder(workspaceRoot, DEFAULT_SETTINGS.pathAlias);

  return {
    workspaceRoot,
    get aliasResolver(): AliasResolver {
      return aliasHolder.get();
    },
    get settingsKey(): string {
      return resourceSettingsDependencyKey(currentSettings);
    },
    get classnameTransform(): Settings["scss"]["classnameTransform"] {
      return currentSettings.scss.classnameTransform;
    },
    get(): Settings {
      return currentSettings;
    },
    set(next: Settings): void {
      currentSettings = next;
    },
    rebuildAliasResolver(pathAlias: Readonly<Record<string, string>>): void {
      aliasHolder.rebuild(pathAlias);
    },
  };
}
