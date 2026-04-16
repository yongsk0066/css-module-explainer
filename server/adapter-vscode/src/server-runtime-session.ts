import { existsSync } from "node:fs";
import type { TextDocuments } from "vscode-languageserver/node";
import type { Connection, InitializeParams } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type ts from "typescript";
import { DEFAULT_RESOURCE_SETTINGS } from "../../engine-core-ts/src/settings";
import type { TypeResolver } from "../../engine-core-ts/src/core/ts/type-resolver";
import type { FileTask } from "../../engine-core-ts/src/core/indexing/indexer-worker";
import {
  resolveClientRuntimeCapabilities,
  type ClientRuntimeCapabilities,
} from "./server-capabilities";
import { createRuntimeSink, readStyleTextFromOpenDocuments } from "./server-runtime-support";
import {
  resolveWorkspaceFolders,
  toWorkspaceFolderInfo,
} from "../../engine-host-node/src/workspace/workspace-folder-info";
import type { WorkspaceRegistry } from "../../engine-host-node/src/workspace/workspace-registry";
import {
  buildSharedRuntimeCaches,
  createRuntimeTypeResolver,
  createStyleDocumentLookup,
  createWorkspaceRuntimeIO,
  createWorkspaceRuntimeManager,
  type WorkspaceRuntimeManager,
} from "../../engine-host-node/src/runtime";

export interface ServerRuntimeSessionOptions {
  readonly typeResolver?: TypeResolver;
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  readonly fileSupplier?: () => AsyncIterable<FileTask>;
  readonly readStyleFileAsync?: (path: string) => Promise<string | null>;
  readonly fileExists?: (path: string) => boolean;
}

export interface ServerRuntimeSession {
  readonly registry: WorkspaceRegistry;
  readonly runtimeManager: WorkspaceRuntimeManager;
  readonly clientCapabilities: ClientRuntimeCapabilities;
  handleWorkspaceFolderChange(
    event: {
      readonly removed: readonly { readonly uri: string; readonly name: string }[];
      readonly added: readonly { readonly uri: string; readonly name: string }[];
    },
    documents: TextDocuments<TextDocument>,
  ): void;
}

export interface CreateServerRuntimeSessionArgs {
  readonly params: InitializeParams;
  readonly options: ServerRuntimeSessionOptions;
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
  readonly readStyleFile: (path: string) => string | null;
  readonly serverName: string;
}

export function createServerRuntimeSession(
  args: CreateServerRuntimeSessionArgs,
): ServerRuntimeSession {
  const workspaceFolders = resolveWorkspaceFolders({
    ...(args.params.workspaceFolders ? { workspaceFolders: args.params.workspaceFolders } : {}),
    ...(args.params.rootUri ? { rootUri: args.params.rootUri } : {}),
    ...(args.params.rootPath ? { rootPath: args.params.rootPath } : {}),
  });
  const clientCapabilities = resolveClientRuntimeCapabilities(args.params);
  const sink = createRuntimeSink(args.connection, clientCapabilities.codeLensRefresh);
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
    readOpenDocumentText: (stylePath) => readStyleTextFromOpenDocuments(stylePath, args.documents),
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
    sink,
    fileExists,
    serverName: args.serverName,
    getModeForStylePath: (stylePath) =>
      runtimeManager?.getDepsForFilePath(stylePath)?.settings.scss.classnameTransform ??
      DEFAULT_RESOURCE_SETTINGS.scss.classnameTransform,
  });
  runtimeManager.registerInitialFolders(workspaceFolders);

  return {
    registry: runtimeManager.getRegistry(),
    runtimeManager,
    clientCapabilities,
    handleWorkspaceFolderChange(event, documents): void {
      for (const folder of event.removed) {
        runtimeManager.removeFolder(folder.uri, documents);
      }

      for (const folder of event.added) {
        if (runtimeManager.hasFolder(folder.uri)) continue;
        runtimeManager.addFolder(toWorkspaceFolderInfo(folder));
      }
    },
  };
}
