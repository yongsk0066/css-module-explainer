import type { ClassRef, Range as SharedRange, ScssClassMap } from "@css-module-explainer/shared";
import type { AnalysisEntry } from "../core/indexing/document-analysis-cache";
import type { CursorParams, ProviderDeps } from "./provider-deps";

// Re-export the provider dependency bag types so the many
// existing `from "./cursor-dispatch"` imports keep resolving
// without every consumer having to change their import path.
export {
  NOOP_LOG_ERROR,
  type CursorParams,
  type DocumentParams,
  type ProviderDeps,
} from "./provider-deps";

/**
 * Does `(line, character)` fall inside `range`? Inclusive on
 * both ends, matching the LSP convention used throughout the
 * codebase. Shared between the cursor-based providers.
 */
export function rangeContains(range: SharedRange, line: number, character: number): boolean {
  const { start, end } = range;
  if (line < start.line || line > end.line) return false;
  if (line === start.line && character < start.character) return false;
  if (line === end.line && character > end.character) return false;
  return true;
}

/**
 * The data every `withClassRefAtCursor` transform receives.
 */
export interface ClassRefContext {
  readonly ref: ClassRef;
  readonly classMap: ScssClassMap;
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
 * Unified front stage for every cursor-based provider.
 *
 * Searches `entry.classRefs` for the ref whose `originRange`
 * contains the cursor, resolves the backing classMap, and hands
 * `{ ref, classMap, entry }` to the transform. Providers branch
 * on `ctx.ref.kind` and `ctx.ref.origin` as needed.
 */
export function withClassRefAtCursor<T>(
  params: CursorParams,
  deps: ProviderDeps,
  transform: (ctx: ClassRefContext) => T | null,
): T | null {
  if (!hasAnyStyleImport(params.content)) return null;

  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.classRefs.length === 0) return null;

  const ref = entry.classRefs.find((r) =>
    rangeContains(r.originRange, params.line, params.character),
  );
  if (!ref) return null;

  const classMap = deps.scssClassMapForPath(ref.scssModulePath);
  if (!classMap) return null;

  return transform({ ref, classMap, entry }) ?? null;
}
