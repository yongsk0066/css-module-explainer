import type { Hover } from "vscode-languageserver/node";
import { resolveClassRefContext } from "../core/cx/call-resolver";
import { toLspRange } from "./lsp-adapters";
import { renderHover } from "./hover-renderer";
import { wrapHandler } from "./_wrap-handler";
import { withClassRefAtCursor, type ClassRefContext } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/hover` for any ClassRef under the cursor.
 *
 * Dispatches through the unified `withClassRefAtCursor` front
 * stage. For every ref kind the resolution is delegated to
 * `resolveClassRefContext`; the resulting `SelectorInfo` list
 * is handed to the pure `renderHover` markdown builder. An empty
 * match yields a `null` Hover; an exception is logged by
 * `wrapHandler` and also returns `null`.
 */
export const handleHover = wrapHandler<CursorParams, [maxCandidates?: number], Hover | null>(
  "hover",
  (params, deps, maxCandidates = 10) =>
    withClassRefAtCursor(params, deps, (ctx) => buildHover(ctx, params, deps, maxCandidates)),
  null,
);

function buildHover(
  ctx: ClassRefContext,
  params: CursorParams,
  deps: ProviderDeps,
  maxCandidates: number,
): Hover | null {
  const infos = resolveClassRefContext(ctx, {
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  const markdown = renderHover({
    ref: ctx.ref,
    scssModulePath: ctx.ref.scssModulePath,
    infos,
    workspaceRoot: deps.workspaceRoot,
    maxCandidates,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.ref.originRange),
    contents: { kind: "markdown", value: markdown },
  };
}
