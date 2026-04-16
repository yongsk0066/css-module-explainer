import type { StyleDocumentHIR } from "../../../engine-core-ts/src/core/hir/style-types";
import type { TypeResolver } from "../../../engine-core-ts/src/core/ts/type-resolver";
import type { ResourceSettings } from "../../../engine-core-ts/src/settings";
import type { WorkspaceFolderInfo, WorkspaceRegistry } from "../workspace/workspace-registry";
import type { SharedRuntimeCaches } from "./shared-runtime-caches";
import type { RuntimeSink } from "./runtime-sink";
import { createWorkspaceRuntime, type WorkspaceRuntime } from "./workspace-runtime";
import type { RuntimeDocumentsLike } from "./workspace-runtime-support";
import type { WorkspaceRuntimeIO } from "./workspace-runtime";

export interface WorkspaceRuntimeRegistryArgs {
  readonly registry: WorkspaceRegistry;
  readonly runtimes: Map<string, WorkspaceRuntime>;
  readonly folder: WorkspaceFolderInfo;
  readonly workspaceFolders: readonly WorkspaceFolderInfo[];
  readonly caches: SharedRuntimeCaches;
  readonly typeResolver: TypeResolver;
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly io: WorkspaceRuntimeIO;
  readonly sink: RuntimeSink;
  readonly fileExists: (path: string) => boolean;
  readonly serverName: string;
  readonly getModeForStylePath: (path: string) => ResourceSettings["scss"]["classnameTransform"];
}

export interface WorkspaceRuntimeUnregisterArgs {
  readonly registry: WorkspaceRegistry;
  readonly runtimes: Map<string, WorkspaceRuntime>;
  readonly folderUri: string;
  readonly documents: RuntimeDocumentsLike;
}

export function registerWorkspaceRuntime(args: WorkspaceRuntimeRegistryArgs): WorkspaceRuntime {
  const runtime = createWorkspaceRuntime({
    folder: args.folder,
    workspaceFolders: args.workspaceFolders,
    caches: args.caches,
    typeResolver: args.typeResolver,
    styleDocumentForPath: args.styleDocumentForPath,
    io: args.io,
    sink: args.sink,
    fileExists: args.fileExists,
    serverName: args.serverName,
    getModeForStylePath: args.getModeForStylePath,
  });
  args.registry.register(args.folder, runtime.deps);
  args.runtimes.set(args.folder.uri, runtime);
  return runtime;
}

export function unregisterWorkspaceRuntime(args: WorkspaceRuntimeUnregisterArgs): boolean {
  const existing = args.registry.getFolder(args.folderUri);
  if (!existing) return false;
  const deps = args.registry.unregister(args.folderUri);
  if (!deps) return false;
  const runtime = args.runtimes.get(args.folderUri);
  runtime?.clearWorkspaceDocuments(args.documents);
  runtime?.dispose();
  args.runtimes.delete(args.folderUri);
  return true;
}
