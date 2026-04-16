import type { StyleDocumentHIR } from "../../../engine-core-ts/src/core/hir/style-types";
import type { TypeResolver } from "../../../engine-core-ts/src/core/ts/type-resolver";
import type { ResourceSettings } from "../../../engine-core-ts/src/settings";
import {
  type WorkspaceFolderInfo,
  WorkspaceRegistry,
  type WorkspaceProviderDeps,
} from "../workspace/workspace-registry";
import type { SharedRuntimeCaches } from "./shared-runtime-caches";
import type { RuntimeSink } from "./runtime-sink";
import type { WorkspaceRuntime, WorkspaceRuntimeIO } from "./workspace-runtime";
import type { RuntimeDocumentsLike } from "./workspace-runtime-support";
import { registerWorkspaceRuntime, unregisterWorkspaceRuntime } from "./workspace-runtime-registry";

export interface WorkspaceRuntimeManagerArgs {
  readonly caches: SharedRuntimeCaches;
  readonly typeResolver: TypeResolver;
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly io: WorkspaceRuntimeIO;
  readonly sink: RuntimeSink;
  readonly fileExists: (path: string) => boolean;
  readonly serverName: string;
  readonly getModeForStylePath: (path: string) => ResourceSettings["scss"]["classnameTransform"];
}

export interface WorkspaceRuntimeManager {
  getRegistry(): WorkspaceRegistry;
  getDeps(documentUri: string): WorkspaceProviderDeps | null;
  getDepsForFilePath(filePath: string): WorkspaceProviderDeps | null;
  hasFolder(folderUri: string): boolean;
  getFolders(): readonly WorkspaceFolderInfo[];
  registerInitialFolders(folders: readonly WorkspaceFolderInfo[]): void;
  addFolder(folder: WorkspaceFolderInfo): void;
  removeFolder(folderUri: string, documents: RuntimeDocumentsLike): boolean;
}

export function createWorkspaceRuntimeManager(
  args: WorkspaceRuntimeManagerArgs,
): WorkspaceRuntimeManager {
  const registry = new WorkspaceRegistry();
  const runtimes = new Map<string, WorkspaceRuntime>();

  return {
    getRegistry(): WorkspaceRegistry {
      return registry;
    },
    getDeps(documentUri: string): WorkspaceProviderDeps | null {
      return registry.getDeps(documentUri);
    },
    getDepsForFilePath(filePath: string): WorkspaceProviderDeps | null {
      return registry.getDepsForFilePath(filePath);
    },
    hasFolder(folderUri: string): boolean {
      return registry.getFolder(folderUri) !== null;
    },
    getFolders(): readonly WorkspaceFolderInfo[] {
      return registry.getFolders();
    },
    registerInitialFolders(folders: readonly WorkspaceFolderInfo[]): void {
      for (const folder of folders) {
        registerWorkspaceRuntime({
          registry,
          runtimes,
          folder,
          workspaceFolders: folders,
          caches: args.caches,
          typeResolver: args.typeResolver,
          styleDocumentForPath: args.styleDocumentForPath,
          io: args.io,
          sink: args.sink,
          fileExists: args.fileExists,
          serverName: args.serverName,
          getModeForStylePath: args.getModeForStylePath,
        });
      }
    },
    addFolder(folder: WorkspaceFolderInfo): void {
      if (registry.getFolder(folder.uri)) return;
      registerWorkspaceRuntime({
        registry,
        runtimes,
        folder,
        workspaceFolders: [...registry.getFolders(), folder],
        caches: args.caches,
        typeResolver: args.typeResolver,
        styleDocumentForPath: args.styleDocumentForPath,
        io: args.io,
        sink: args.sink,
        fileExists: args.fileExists,
        serverName: args.serverName,
        getModeForStylePath: args.getModeForStylePath,
      });
    },
    removeFolder(folderUri: string, documents: RuntimeDocumentsLike): boolean {
      return unregisterWorkspaceRuntime({
        registry,
        runtimes,
        folderUri,
        documents,
      });
    },
  };
}
