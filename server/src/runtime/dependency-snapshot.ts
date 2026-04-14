import type { ProviderDeps } from "../providers/provider-deps";
import type { OpenDocumentSnapshot } from "./invalidation-planner";

export interface RuntimeDependencySnapshot {
  readonly openDocuments: readonly OpenDocumentSnapshot[];
  findSettingsDependencyUris(workspaceRoot: string, settingsKey: string): readonly string[];
  findSourceDependencyUris(workspaceRoot: string, sourcePath: string): readonly string[];
  findStyleDependentSourceUris(workspaceRoot: string, scssPath: string): readonly string[];
}

export function createRuntimeDependencySnapshot(
  bundles: readonly ProviderDeps[],
  openDocuments: readonly OpenDocumentSnapshot[],
): RuntimeDependencySnapshot {
  const depsByWorkspaceRoot = new Map(bundles.map((deps) => [deps.workspaceRoot, deps]));

  return {
    openDocuments,
    findSettingsDependencyUris(workspaceRoot, settingsKey) {
      return (
        depsByWorkspaceRoot
          .get(workspaceRoot)
          ?.semanticReferenceIndex.dependencies.findUrisBySettingsDependency(
            workspaceRoot,
            settingsKey,
          ) ?? []
      );
    },
    findSourceDependencyUris(workspaceRoot, sourcePath) {
      return (
        depsByWorkspaceRoot
          .get(workspaceRoot)
          ?.semanticReferenceIndex.dependencies.findUrisBySourceDependency(
            workspaceRoot,
            sourcePath,
          ) ?? []
      );
    },
    findStyleDependentSourceUris(workspaceRoot, scssPath) {
      return (
        depsByWorkspaceRoot
          .get(workspaceRoot)
          ?.semanticReferenceIndex.dependencies.findReferencingUris(scssPath) ?? []
      );
    },
  };
}
