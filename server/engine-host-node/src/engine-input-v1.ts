import type {
  EngineInputV1,
  SourceAnalysisInputV1,
  StyleAnalysisInputV1,
} from "../../engine-core-ts/src/contracts";
import {
  ENGINE_CONTRACT_VERSION_V1,
  buildSourceBindingGraphSnapshotV1,
} from "../../engine-core-ts/src/contracts";
import type { DocumentAnalysisCache } from "../../engine-core-ts/src/core/indexing/document-analysis-cache";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ClassnameTransformMode } from "../../engine-core-ts/src/core/scss/classname-transform";
import type { TypeResolver } from "../../engine-core-ts/src/core/ts/type-resolver";
import type ts from "typescript";
import {
  workspaceSettingsKey,
  type SourceDocumentSnapshot,
} from "./checker-host/workspace-check-support";
import { selectTypeFactCollector } from "./type-fact-collector";
import type { TypeFactBackendKind } from "./type-backend";

export interface BuildEngineInputV1Options {
  readonly workspaceRoot: string;
  readonly classnameTransform: ClassnameTransformMode;
  readonly pathAlias: Readonly<Record<string, string>>;
  readonly sourceDocuments: readonly SourceDocumentSnapshot[];
  readonly styleFiles: readonly string[];
  readonly analysisCache: DocumentAnalysisCache;
  readonly styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null;
  readonly typeResolver?: TypeResolver;
  readonly typeBackend?: TypeFactBackendKind;
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  readonly env?: NodeJS.ProcessEnv;
}

export function buildEngineInputV1(options: BuildEngineInputV1Options): EngineInputV1 {
  const sourceEntries = options.sourceDocuments.map((document) => ({
    document,
    analysis: options.analysisCache.get(
      document.uri,
      document.content,
      document.filePath,
      document.version,
    ),
  }));

  const sources: SourceAnalysisInputV1[] = sourceEntries.map(({ document, analysis }) => ({
    filePath: document.filePath,
    document: analysis.sourceDocument,
    bindingGraph: buildSourceBindingGraphSnapshotV1(analysis.sourceBindingGraph),
  }));

  const styles: StyleAnalysisInputV1[] = options.styleFiles.flatMap((filePath) => {
    const document = options.styleDocumentForPath(filePath);
    return document ? [{ filePath, document }] : [];
  });

  const typeFactCollector = selectTypeFactCollector({
    ...(options.typeResolver ? { typeResolver: options.typeResolver } : {}),
    ...(options.typeBackend ? { typeBackend: options.typeBackend } : {}),
    ...(options.createProgram ? { createProgram: options.createProgram } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const typeFacts = typeFactCollector.collectV1({
    workspaceRoot: options.workspaceRoot,
    sourceEntries,
  });

  return {
    version: ENGINE_CONTRACT_VERSION_V1,
    workspace: {
      root: options.workspaceRoot,
      classnameTransform: options.classnameTransform,
      settingsKey: workspaceSettingsKey(options.classnameTransform, options.pathAlias),
    },
    sources,
    styles,
    typeFacts,
  };
}
