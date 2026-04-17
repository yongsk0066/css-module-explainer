import type {
  EngineInputV2,
  SourceAnalysisInputV1,
  StyleAnalysisInputV1,
} from "../../engine-core-ts/src/contracts";
import {
  ENGINE_CONTRACT_VERSION_V2,
  buildSourceBindingGraphSnapshotV1,
} from "../../engine-core-ts/src/contracts";
import type { DocumentAnalysisCache } from "../../engine-core-ts/src/core/indexing/document-analysis-cache";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ClassnameTransformMode } from "../../engine-core-ts/src/core/scss/classname-transform";
import type { TypeResolver } from "../../engine-core-ts/src/core/ts/type-resolver";
import {
  workspaceSettingsKey,
  type SourceDocumentSnapshot,
} from "./checker-host/workspace-check-support";
import { collectTypeFactTableV2 } from "./type-fact-table-v2";

export interface BuildEngineInputV2Options {
  readonly workspaceRoot: string;
  readonly classnameTransform: ClassnameTransformMode;
  readonly pathAlias: Readonly<Record<string, string>>;
  readonly sourceDocuments: readonly SourceDocumentSnapshot[];
  readonly styleFiles: readonly string[];
  readonly analysisCache: DocumentAnalysisCache;
  readonly styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
}

export function buildEngineInputV2(options: BuildEngineInputV2Options): EngineInputV2 {
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

  const typeFacts = collectTypeFactTableV2({
    workspaceRoot: options.workspaceRoot,
    typeResolver: options.typeResolver,
    sourceEntries,
  });

  return {
    version: ENGINE_CONTRACT_VERSION_V2,
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
