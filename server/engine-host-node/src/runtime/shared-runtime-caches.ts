import { StyleIndexCache } from "../../../engine-core-ts/src/core/scss/scss-index";
import { SourceFileCache } from "../../../engine-core-ts/src/core/ts/source-file-cache";
import {
  WorkspaceSemanticWorkspaceReferenceIndex,
  WorkspaceStyleDependencyGraph,
} from "../../../engine-core-ts/src/core/semantic";

export interface SharedRuntimeCaches {
  readonly sourceFileCache: SourceFileCache;
  readonly styleIndexCache: StyleIndexCache;
  readonly semanticReferenceIndex: WorkspaceSemanticWorkspaceReferenceIndex;
  readonly styleDependencyGraph: WorkspaceStyleDependencyGraph;
}

export function buildSharedRuntimeCaches(): SharedRuntimeCaches {
  return {
    sourceFileCache: new SourceFileCache({ max: 200 }),
    styleIndexCache: new StyleIndexCache({ max: 500 }),
    semanticReferenceIndex: new WorkspaceSemanticWorkspaceReferenceIndex(),
    styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
  };
}
