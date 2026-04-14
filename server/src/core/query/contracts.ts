import type { DocumentAnalysisCache } from "../indexing/document-analysis-cache";
import type { StyleDocumentHIR } from "../hir/style-types";

export interface SourceExpressionCursor {
  readonly documentUri: string;
  readonly content: string;
  readonly filePath: string;
  readonly version: number;
  readonly line: number;
  readonly character: number;
}

export interface SourceExpressionQueryDeps {
  readonly analysisCache: Pick<DocumentAnalysisCache, "get">;
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
}
