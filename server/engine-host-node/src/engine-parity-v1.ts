import type {
  CheckerReportV1,
  EngineInputV1,
  EngineOutputV1,
} from "../../engine-core-ts/src/contracts";
import { buildEngineInputV1, type BuildEngineInputV1Options } from "./engine-input-v1";
import { buildSelectedQueryResultsV1 } from "./engine-query-v1";
import { buildEngineOutputV1 } from "./engine-output-v1";
import type { WorkspaceSemanticWorkspaceReferenceIndex } from "../../engine-core-ts/src/core/semantic/workspace-reference-index";
import type { WorkspaceStyleDependencyGraph } from "../../engine-core-ts/src/core/semantic/style-dependency-graph";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { DocumentAnalysisCache } from "../../engine-core-ts/src/core/indexing/document-analysis-cache";
import type { TypeResolver } from "../../engine-core-ts/src/core/ts/type-resolver";
import type { SourceDocumentSnapshot } from "./checker-host/workspace-check-support";

export interface EngineParitySnapshotV1 {
  readonly input: EngineInputV1;
  readonly output: EngineOutputV1;
}

export interface BuildCheckerEngineParitySnapshotV1Options extends BuildEngineInputV1Options {
  readonly checkerReport: CheckerReportV1;
  readonly sourceDocuments: readonly SourceDocumentSnapshot[];
  readonly styleFiles: readonly string[];
  readonly analysisCache: DocumentAnalysisCache;
  readonly styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly semanticReferenceIndex: WorkspaceSemanticWorkspaceReferenceIndex;
  readonly styleDependencyGraph: WorkspaceStyleDependencyGraph;
}

export function buildCheckerEngineParitySnapshotV1(
  options: BuildCheckerEngineParitySnapshotV1Options,
): EngineParitySnapshotV1 {
  return {
    input: buildEngineInputV1(options),
    output: buildEngineOutputV1({
      checkerReport: options.checkerReport,
      queryResults: buildSelectedQueryResultsV1({
        workspaceRoot: options.workspaceRoot,
        sourceDocuments: options.sourceDocuments,
        styleFiles: options.styleFiles,
        analysisCache: options.analysisCache,
        styleDocumentForPath: options.styleDocumentForPath,
        typeResolver: options.typeResolver,
        semanticReferenceIndex: options.semanticReferenceIndex,
        styleDependencyGraph: options.styleDependencyGraph,
      }),
    }),
  };
}
