import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath } from "../core/util/text-utils";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextDocuments } from "vscode-languageserver/node";
import type { ProviderDeps } from "../providers/provider-deps";
import type { OpenDocumentSnapshot } from "./invalidation-planner";

export interface RuntimeDependencySnapshot {
  readonly openDocuments: readonly OpenDocumentSnapshot[];
  findSettingsDependencyUris(workspaceRoot: string, settingsKey: string): readonly string[];
  findSourceDependencyUris(workspaceRoot: string, sourcePath: string): readonly string[];
  findStyleDependentSourceUris(workspaceRoot: string, scssPath: string): readonly string[];
}

export interface OpenDocumentSnapshotContext {
  readonly documents: Pick<TextDocuments<TextDocument>, "all">;
  getDeps(uri: string): ProviderDeps | null;
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

export function snapshotOpenDocuments(
  ctx: OpenDocumentSnapshotContext,
): readonly OpenDocumentSnapshot[] {
  return ctx.documents.all().map((doc) => {
    const filePath = fileUrlToPath(doc.uri);
    return {
      uri: doc.uri,
      filePath,
      isStyle: findLangForPath(filePath) !== null,
      workspaceRoot: ctx.getDeps(doc.uri)?.workspaceRoot ?? null,
    };
  });
}
