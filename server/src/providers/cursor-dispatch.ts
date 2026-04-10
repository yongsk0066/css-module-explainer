import type {
  CxCallInfo,
  Range as SharedRange,
  ScssClassMap,
  SelectorInfo,
  StylePropertyRef,
} from "@css-module-explainer/shared";
import type {
  AnalysisEntry,
  DocumentAnalysisCache,
} from "../core/indexing/document-analysis-cache";
import type { ReverseIndex } from "../core/indexing/reverse-index";
import type { TypeResolver } from "../core/ts/type-resolver";

/**
 * Identity + content of a single open document. Used by
 * document-wide computations (diagnostics) that do not care
 * about a cursor position.
 */
export interface DocumentParams {
  readonly documentUri: string;
  readonly content: string;
  readonly filePath: string;
  readonly version: number;
}

/**
 * One request's cursor location, plus the document context the
 * provider needs to resolve it. Extends `DocumentParams` so
 * cursor providers can be passed to document-wide helpers
 * without an explicit narrowing step.
 */
export interface CursorParams extends DocumentParams {
  readonly line: number;
  readonly character: number;
}

/**
 * The dependency bag every provider handler accepts.
 *
 * Composition root (server/src/server.ts) builds this once at
 * startup; provider unit tests build a stub via `makeDeps()` in
 * test helpers. Keeping this a plain interface with no methods
 * keeps provider tests trivial.
 */
export interface ProviderDeps {
  readonly analysisCache: DocumentAnalysisCache;
  /**
   * Look up the ScssClassMap for a style module file path.
   */
  readonly scssClassMapForPath: (path: string) => ScssClassMap | null;
  readonly typeResolver: TypeResolver;
  readonly reverseIndex: ReverseIndex;
  readonly workspaceRoot: string;
  /**
   * Log a provider-level exception. Wired to
   * `connection.console.error` in production; tests pass
   * `NOOP_LOG_ERROR`. Required so the "log + return empty
   * result" contract is explicit at every call site.
   */
  readonly logError: (message: string, err: unknown) => void;
}

/** No-op logError stub for tests — keeps `ProviderDeps.logError` required. */
export const NOOP_LOG_ERROR: (message: string, err: unknown) => void = () => {};

/**
 * The data every `withCxCallAtCursor` transform receives.
 *
 * Kept to the three fields the design spec (section 4.1) defines.
 * Providers access `deps` (typeResolver, reverseIndex, workspaceRoot,
 * scssClassMapForPath) and `params` (filePath, documentUri, version) via
 * closure in the outer provider function — no pass-throughs.
 *
 * `entry` carries the already-parsed AnalysisEntry so providers can
 * read `entry.sourceFile`, `entry.bindings`, or `entry.calls` without
 * a second cache lookup (the "one parse per file" invariant).
 */
export interface CxCallContext {
  readonly call: CxCallInfo;
  readonly classMap: ScssClassMap;
  readonly entry: AnalysisEntry;
}

/**
 * Front stage for cursor-based cx() providers (definition, hover).
 * Fast-paths on `hasCxBindImport` and empty bindings, then
 * finds the CxCallInfo whose originRange contains the cursor.
 */
export function withCxCallAtCursor<T>(
  params: CursorParams,
  deps: ProviderDeps,
  transform: (ctx: CxCallContext) => T | null,
): T | null {
  // Fast path 1 — no classnames/bind import anywhere in the file.
  if (!hasCxBindImport(params.content)) {
    return null;
  }

  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.bindings.length === 0) {
    return null;
  }

  const call = findCallAtCursor(entry.calls, params.line, params.character);
  if (!call) return null;

  const classMap = deps.scssClassMapForPath(call.scssModulePath);
  if (!classMap) return null;

  // Normalize `undefined` → `null` so a transform with a missing
  // return branch still yields a strict nullable.
  return transform({ call, classMap, entry }) ?? null;
}

/**
 * Fast-path predicate: does this document contain a
 * `classnames/bind` import anywhere? Used by every provider
 * before touching the AST.
 */
export function hasCxBindImport(content: string): boolean {
  return content.includes("classnames/bind");
}

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

function findCallAtCursor(
  calls: readonly CxCallInfo[],
  line: number,
  character: number,
): CxCallInfo | null {
  return calls.find((call) => rangeContains(call.originRange, line, character)) ?? null;
}

// ──────────────────────────────────────────────────────────────
// styles.className direct reference dispatcher
// ──────────────────────────────────────────────────────────────

export interface StyleRefContext {
  readonly ref: StylePropertyRef;
  readonly classMap: ScssClassMap;
  readonly info: SelectorInfo | null;
  readonly entry: AnalysisEntry;
}

/**
 * Front stage for `styles.className` direct references (non-cx).
 *
 * Searches the cached `styleRefs` for one whose `originRange`
 * contains the cursor, then resolves it against the classMap.
 * If no match, returns null — letting the cx pipeline handle it.
 *
 * Use as a FALLBACK after `withCxCallAtCursor`: each provider
 * calls both dispatchers and returns whichever hits first.
 */
export function withStyleRefAtCursor<T>(
  params: CursorParams,
  deps: ProviderDeps,
  transform: (ctx: StyleRefContext) => T | null,
): T | null {
  // Fast path: check if the file imports any .module.* files.
  if (!params.content.includes(".module.")) return null;

  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.styleRefs.length === 0) return null;

  const ref = entry.styleRefs.find((r) =>
    rangeContains(r.originRange, params.line, params.character),
  );
  if (!ref) return null;

  const classMap = deps.scssClassMapForPath(ref.scssModulePath);
  if (!classMap) return null;

  const info = classMap.get(ref.className) ?? null;
  return transform({ ref, classMap, info, entry }) ?? null;
}
