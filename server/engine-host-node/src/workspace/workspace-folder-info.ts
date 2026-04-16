import { fileUrlToPath, pathToFileUrl } from "../../../src/core/util/text-utils";
import type { WorkspaceFolderInfo } from "./workspace-registry";

export interface WorkspaceFolderResolutionInput {
  readonly workspaceFolders?: readonly {
    readonly uri: string;
    readonly name: string;
  }[];
  readonly rootUri?: string | null;
  readonly rootPath?: string | null;
  readonly cwd?: string;
}

export function resolveWorkspaceFolders(
  input: WorkspaceFolderResolutionInput,
): readonly WorkspaceFolderInfo[] {
  if (input.workspaceFolders && input.workspaceFolders.length > 0) {
    return input.workspaceFolders.map(toWorkspaceFolderInfo);
  }
  const rootPath = input.rootUri
    ? fileUrlToPath(input.rootUri)
    : input.rootPath
      ? input.rootPath
      : (input.cwd ?? process.cwd());
  return [
    {
      uri: pathToFileUrl(rootPath),
      rootPath,
      name: rootPath.split(/[\\/]/u).pop() || rootPath,
    },
  ];
}

export function toWorkspaceFolderInfo(folder: {
  readonly uri: string;
  readonly name: string;
}): WorkspaceFolderInfo {
  return {
    uri: folder.uri,
    rootPath: fileUrlToPath(folder.uri),
    name: folder.name,
  };
}
