import nodePath from "node:path";
import { fileUrlToPath } from "../../../engine-core-ts/src/core/util/text-utils";
import {
  pickOwningWorkspaceFolder,
  type WorkspaceFolderInfo,
  type WorkspaceProviderDeps,
} from "../workspace/workspace-registry";
import type { RuntimeSink } from "./runtime-sink";

export interface RuntimeDocumentsLike {
  all(): readonly { readonly uri: string }[];
}

export function createOwnedStylePathMatcher(
  folders: readonly WorkspaceFolderInfo[],
  ownerFolderUri: string,
): (stylePath: string) => boolean {
  return (stylePath: string) =>
    pickOwningWorkspaceFolder(folders, stylePath)?.uri === ownerFolderUri;
}

export function clearWorkspaceDocumentsWithinRoot(
  workspaceRoot: string,
  documents: RuntimeDocumentsLike,
  deps: WorkspaceProviderDeps,
  sink: RuntimeSink,
): void {
  deps.styleDependencyGraph.forgetWithinRoot(workspaceRoot);
  for (const doc of documents.all()) {
    const filePath = fileUrlToPath(doc.uri);
    if (!isWithinWorkspaceRoot(workspaceRoot, filePath)) continue;
    deps.semanticReferenceIndex.forget(doc.uri);
    deps.analysisCache.invalidate(doc.uri);
    sink.clearDiagnostics(doc.uri);
  }
  deps.refreshCodeLens();
}

function isWithinWorkspaceRoot(workspaceRoot: string, filePath: string): boolean {
  const rel = nodePath.relative(workspaceRoot, filePath);
  return rel === "" || (!rel.startsWith("..") && !nodePath.isAbsolute(rel));
}
