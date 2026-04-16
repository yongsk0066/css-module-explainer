import { readSourceExpressionContextAtCursor, type SourceExpressionContext } from "../core/query";
import type { CursorParams, ProviderDeps } from "../provider-deps";

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
  return readSourceExpressionContextAtCursor(params, deps);
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

export type { SourceExpressionContext } from "../core/query";
export type { CursorParams, ProviderDeps } from "../provider-deps";
