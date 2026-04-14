import type { AnalysisEntry } from "../core/indexing/document-analysis-cache";
import type { ClassExpressionHIR } from "../core/hir/source-types";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import { rangeContains } from "../core/util/range-utils";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * The data every cursor-based semantic provider receives.
 */
export interface SourceExpressionContext {
  readonly expression: ClassExpressionHIR;
  readonly styleDocument: StyleDocumentHIR;
  readonly entry: AnalysisEntry;
}

/**
 * Unified front stage for every source-expression-based provider.
 *
 * Searches `entry.sourceDocument.classExpressions` for the
 * expression whose source range contains the cursor, resolves the
 * backing style document, and hands `{ expression, styleDocument,
 * entry }` to the transform.
 */
export function findSourceExpressionContextAtCursor(
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

  const styleDocument = resolveStyleDocument(deps, expression.scssModulePath);
  if (!styleDocument) return null;

  return { expression, styleDocument, entry };
}

export function withSourceExpressionAtCursor<T>(
  params: CursorParams,
  deps: ProviderDeps,
  transform: (ctx: SourceExpressionContext) => T | null,
): T | null {
  const ctx = findSourceExpressionContextAtCursor(params, deps);
  if (!ctx) return null;
  return transform(ctx) ?? null;
}

function resolveStyleDocument(deps: ProviderDeps, scssModulePath: string): StyleDocumentHIR | null {
  return deps.styleDocumentForPath(scssModulePath);
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

export type { CursorParams, ProviderDeps } from "./provider-deps";
