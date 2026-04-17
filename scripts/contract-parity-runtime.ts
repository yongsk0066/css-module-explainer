import path from "node:path";
import {
  collectSourceDocuments,
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
  resolveWorkspaceCheckFiles,
} from "../server/engine-host-node/src/checker-host/workspace-check-support";
import { runWorkspaceCheckCommand } from "../server/engine-host-node/src/checker-host";
import { buildCheckerEngineParitySnapshotV1 } from "../server/engine-host-node/src/engine-parity-v1";
import type { ContractParityEntry } from "./contract-parity-corpus";

export async function buildContractParitySnapshot(entry: ContractParityEntry) {
  const { sourceFiles, styleFiles } = await resolveWorkspaceCheckFiles({
    workspaceRoot: entry.workspace.workspaceRoot,
    ...(entry.workspace.sourceFilePaths
      ? { sourceFilePaths: entry.workspace.sourceFilePaths }
      : {}),
    ...(entry.workspace.styleFilePaths ? { styleFilePaths: entry.workspace.styleFilePaths } : {}),
  });

  const styleHost = createWorkspaceStyleHost({
    styleFiles,
    classnameTransform: entry.workspace.classnameTransform ?? "asIs",
  });
  styleHost.preloadStyleDocuments();
  const analysisHost = createWorkspaceAnalysisHost({
    workspaceRoot: entry.workspace.workspaceRoot,
    classnameTransform: entry.workspace.classnameTransform ?? "asIs",
    pathAlias: entry.workspace.pathAlias ?? {},
    styleDocumentForPath: styleHost.styleDocumentForPath,
  });
  const sourceDocuments = collectSourceDocuments(sourceFiles, analysisHost.analysisCache);
  const command = await runWorkspaceCheckCommand({
    workspace: entry.workspace,
    filters: entry.filters,
  });

  return buildCheckerEngineParitySnapshotV1({
    workspaceRoot: entry.workspace.workspaceRoot,
    classnameTransform: entry.workspace.classnameTransform ?? "asIs",
    pathAlias: entry.workspace.pathAlias ?? {},
    sourceDocuments,
    styleFiles,
    analysisCache: analysisHost.analysisCache,
    styleDocumentForPath: styleHost.styleDocumentForPath,
    typeResolver: analysisHost.typeResolver,
    semanticReferenceIndex: analysisHost.semanticReferenceIndex,
    styleDependencyGraph: styleHost.styleDependencyGraph,
    checkerReport: command.checkerReport,
  });
}

export function normalizeContractParitySnapshot<T>(value: T, workspaceRoot: string): T {
  return normalizeValue(value, path.resolve(workspaceRoot)) as T;
}

export function stableJsonStringify(value: unknown): string {
  return `${JSON.stringify(sortObjectKeys(value), null, 2)}\n`;
}

function normalizeValue(value: unknown, workspaceRoot: string): unknown {
  if (typeof value === "string") {
    return normalizePathString(value, workspaceRoot);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry, workspaceRoot));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested, workspaceRoot)]),
  );
}

function normalizePathString(value: string, workspaceRoot: string): string {
  if (value === workspaceRoot) {
    return "<workspace>";
  }
  if (value.startsWith(`${workspaceRoot}${path.sep}`)) {
    return `<workspace>/${toPosix(path.relative(workspaceRoot, value))}`;
  }
  return value;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortObjectKeys(nested)]),
  );
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
