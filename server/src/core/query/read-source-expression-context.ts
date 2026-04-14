import type { AnalysisEntry } from "../indexing/document-analysis-cache";
import type { ClassExpressionHIR } from "../hir/source-types";
import type { StyleDocumentHIR } from "../hir/style-types";
import { rangeContains } from "../util/range-utils";
import type { CursorParams, ProviderDeps } from "../../providers/provider-deps";

export interface SourceExpressionContext {
  readonly expression: ClassExpressionHIR;
  readonly styleDocument: StyleDocumentHIR;
  readonly entry: AnalysisEntry;
}

export function readSourceExpressionContextAtCursor(
  params: CursorParams,
  deps: ProviderDeps,
): SourceExpressionContext | null {
  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.sourceDocument.classExpressions.length === 0) return null;

  const expression = findMostSpecificExpressionAtCursor(entry, params.line, params.character);
  if (!expression) return null;

  const styleDocument = deps.styleDocumentForPath(expression.scssModulePath);
  if (!styleDocument) return null;

  return { expression, styleDocument, entry };
}

function findMostSpecificExpressionAtCursor(
  entry: AnalysisEntry,
  line: number,
  character: number,
): ClassExpressionHIR | null {
  let best: ClassExpressionHIR | null = null;

  for (const candidate of entry.sourceDocument.classExpressions) {
    if (!rangeContains(candidate.range, line, character)) continue;
    if (!best || isMoreSpecificRange(candidate.range, best.range)) {
      best = candidate;
    }
  }

  return best;
}

function isMoreSpecificRange(
  left: ClassExpressionHIR["range"],
  right: ClassExpressionHIR["range"],
): boolean {
  if (left.start.line !== right.start.line) return left.start.line > right.start.line;
  if (left.start.character !== right.start.character) {
    return left.start.character > right.start.character;
  }
  if (left.end.line !== right.end.line) return left.end.line < right.end.line;
  return left.end.character < right.end.character;
}
