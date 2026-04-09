import type { CxBinding, CxCallInfo, ScssClassMap } from "@css-module-explainer/shared";
import type {
  AnalysisEntry,
  DocumentAnalysisCache,
} from "../core/indexing/document-analysis-cache.js";
import type { ReverseIndex } from "../core/indexing/reverse-index.js";
import type { TypeResolver } from "../core/ts/type-resolver.js";
import { getLineAt } from "../core/util/text-utils.js";

/**
 * One request's cursor location, plus the document context the
 * provider needs to resolve it.
 */
export interface CursorParams {
  readonly documentUri: string;
  readonly content: string;
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly version: number;
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
   * Look up the ScssClassMap for a binding. The composition root
   * wires this to a `StyleIndexCache.get` reading the file from
   * disk; tests pass an in-memory function.
   */
  readonly scssClassMapFor: (binding: CxBinding) => ScssClassMap | null;
  readonly typeResolver: TypeResolver;
  readonly reverseIndex: ReverseIndex;
  readonly workspaceRoot: string;
}

/**
 * The data every `withCxCallAtCursor` transform receives.
 *
 * Kept to the four fields the design spec (section 4.1) defines.
 * Providers access `deps` (typeResolver, reverseIndex, workspaceRoot,
 * scssClassMapFor) and `params` (filePath, documentUri, version) via
 * closure in the outer provider function — no pass-throughs.
 *
 * `entry` carries the already-parsed AnalysisEntry so providers can
 * read `entry.sourceFile`, `entry.bindings`, or `entry.calls` without
 * a second cache lookup (the "one parse per file" invariant).
 */
export interface CxCallContext {
  readonly call: CxCallInfo;
  readonly binding: CxBinding;
  readonly classMap: ScssClassMap;
  readonly entry: AnalysisEntry;
}

/**
 * Front stage for every Plan 06–09.5 provider.
 *
 * Three fast paths are checked before any AST work:
 *
 *   1. `content.includes('classnames/bind')` — skip files that
 *      import nothing relevant.
 *   2. Cursor line has no `(` — no cx call can possibly be open
 *      at the cursor.
 *   3. `analysisCache.get()` returns empty bindings → skip.
 *
 * Only then does the function iterate the cached `CxCallInfo`
 * list looking for one whose `originRange` contains the cursor.
 * If found, the transform is invoked with a fully-populated
 * CxCallContext including the resolved SCSS class map.
 *
 * The function never throws — transform exceptions bubble.
 */
export function withCxCallAtCursor<T>(
  params: CursorParams,
  deps: ProviderDeps,
  transform: (ctx: CxCallContext) => T | null,
): T | null {
  // Fast path 1 — no classnames/bind import anywhere in the file.
  if (!params.content.includes("classnames/bind")) {
    return null;
  }

  // Fast path 2 — the cursor line has no `(`, so no cx call can
  // span it. Note: getLineAt is cheap (O(line length)), not
  // O(file length), so this is safe to run on every request.
  const line = getLineAt(params.content, params.line);
  if (line === undefined || !line.includes("(")) {
    return null;
  }

  // Slow path — parse and walk.
  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.bindings.length === 0) {
    return null;
  }

  // Record findings into the reverse index unconditionally so
  // Phase Final's WorkspaceReverseIndex receives data on the
  // first swap. Phase 5's NullReverseIndex is a no-op.
  //
  // PHASE FINAL NOTE: recording on every provider hot-path call
  // is wasteful once NullReverseIndex is swapped for a real
  // WorkspaceReverseIndex. When Phase Final lands, move this
  // record() call to DocumentAnalysisCache.analyze() so it fires
  // once per (uri, version) instead of once per hover/def/comp.
  const callSites = entry.calls.map((call) => ({
    uri: params.documentUri,
    range: call.originRange,
    binding: call.binding,
    kind: call.kind,
    matchInfo: matchInfoFor(call),
  }));
  deps.reverseIndex.record(params.documentUri, callSites);

  // Find the call whose originRange contains the cursor.
  const call = findCallAtCursor(entry.calls, params.line, params.character);
  if (!call) return null;

  const classMap = deps.scssClassMapFor(call.binding);
  if (!classMap) return null;

  return transform({
    call,
    binding: call.binding,
    classMap,
    entry,
  });
}

/**
 * Return true when the last `cxVarName(` on `textBefore` is still
 * open — i.e. the cursor is inside the argument list of a cx
 * call. Used by the completion provider to gate trigger chars.
 */
export function isInsideCxCall(textBefore: string, cxVarName: string): boolean {
  const needle = `${cxVarName}(`;
  const callIdx = textBefore.lastIndexOf(needle);
  if (callIdx === -1) return false;

  // Walk forward from after the opening paren, counting
  // parenthesis depth. We are inside the cx call if depth > 0
  // by the end of the string.
  let depth = 1;
  for (let i = callIdx + needle.length; i < textBefore.length; i += 1) {
    const ch = textBefore[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return false;
    }
  }
  return depth > 0;
}

function findCallAtCursor(
  calls: readonly CxCallInfo[],
  line: number,
  character: number,
): CxCallInfo | null {
  for (const call of calls) {
    const { start, end } = call.originRange;
    if (line < start.line || line > end.line) continue;
    if (line === start.line && character < start.character) continue;
    if (line === end.line && character > end.character) continue;
    return call;
  }
  return null;
}

function matchInfoFor(call: CxCallInfo): string {
  switch (call.kind) {
    case "static":
      return `static: ${call.className}`;
    case "template":
      return `prefix: ${call.staticPrefix}`;
    case "variable":
      return `variable: ${call.variableName}`;
  }
}
