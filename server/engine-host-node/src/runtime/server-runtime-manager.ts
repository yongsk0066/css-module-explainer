import { existsSync } from "node:fs";
import type ts from "typescript";
import { DEFAULT_RESOURCE_SETTINGS } from "../../../engine-core-ts/src/settings";
import type { FileTask } from "../../../engine-core-ts/src/core/indexing/indexer-worker";
import type { TypeResolver } from "../../../engine-core-ts/src/core/ts/type-resolver";
import type { WorkspaceRegistry } from "../workspace/workspace-registry";
import { buildSharedRuntimeCaches } from "./shared-runtime-caches";
import {
  createRuntimeTypeResolver,
  createStyleDocumentLookup,
  createWorkspaceRuntimeIO,
} from "./workspace-runtime-bootstrap";
import {
  createWorkspaceRuntimeManager,
  type WorkspaceRuntimeManager,
} from "./workspace-runtime-manager";
import type { RuntimeSink } from "./runtime-sink";

export interface ServerRuntimeManagerOptions {
  readonly typeResolver?: TypeResolver;
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
  readonly readStyleFileAsync?: (path: string) => Promise<string | null>;
  readonly fileExists?: (path: string) => boolean;
}

export interface CreateServerRuntimeManagerArgs {
  readonly options: ServerRuntimeManagerOptions;
  readonly readStyleFile: (path: string) => string | null;
  readonly readOpenDocumentText: (path: string) => string | null;
  readonly sink: RuntimeSink;
  readonly serverName: string;
}

export interface ServerRuntimeManagerBundle {
  readonly registry: WorkspaceRegistry;
  readonly runtimeManager: WorkspaceRuntimeManager;
}

export function createServerRuntimeManager(
  args: CreateServerRuntimeManagerArgs,
): ServerRuntimeManagerBundle {
  const caches = buildSharedRuntimeCaches();
  const typeResolver = createRuntimeTypeResolver({
    ...(args.options.typeResolver ? { typeResolver: args.options.typeResolver } : {}),
    ...(args.options.createProgram ? { createProgram: args.options.createProgram } : {}),
  });
  const fileExists = args.options.fileExists ?? existsSync;
  const runtimeIO = createWorkspaceRuntimeIO({
    readStyleFile: args.readStyleFile,
    ...(args.options.readStyleFileAsync
      ? { readStyleFileAsync: args.options.readStyleFileAsync }
      : {}),
    ...(args.options.fileSupplier ? { fileSupplier: args.options.fileSupplier } : {}),
  });

  let runtimeManager: WorkspaceRuntimeManager | null = null;
  const styleDocumentForPath = createStyleDocumentLookup({
    styleIndexCache: caches.styleIndexCache,
    styleDependencyGraph: caches.styleDependencyGraph,
    readOpenDocumentText: args.readOpenDocumentText,
    readStyleFile: args.readStyleFile,
    getModeForPath: (stylePath) =>
      runtimeManager?.getDepsForFilePath(stylePath)?.settings.scss.classnameTransform ??
      DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform,
  });

  runtimeManager = createWorkspaceRuntimeManager({
    caches,
    typeResolver,
    styleDocumentForPath,
    io: runtimeIO,
    sink: args.sink,
    fileExists,
    serverName: args.serverName,
    getModeForStylePath: (stylePath) =>
      runtimeManager?.getDepsForFilePath(stylePath)?.settings.scss.classnameTransform ??
      DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform,
  });

  return {
    registry: runtimeManager.getRegistry(),
    runtimeManager,
  };
}
