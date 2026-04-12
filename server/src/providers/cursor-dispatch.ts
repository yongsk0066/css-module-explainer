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
 * Fast-path predicate: does this document reference any CSS
 * Module? Matches either `*.module.*` imports or
 * `classnames/bind` usage.
 */
export function hasAnyStyleImport(content: string): boolean {
  return content.includes(".module.") || content.includes("classnames/bind");
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
  if (!hasAnyStyleImport(params.content)) return null;

  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.sourceDocument.classExpressions.length === 0) return null;

  const expression = entry.sourceDocument.classExpressions.find((candidate) =>
    rangeContains(candidate.range, params.line, params.character),
  );
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

export type { CursorParams, ProviderDeps } from "./provider-deps";
