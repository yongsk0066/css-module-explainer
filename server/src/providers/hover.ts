import type { Hover } from "vscode-languageserver/node";
import { resolveRefDetails } from "../core/query/resolve-ref";
import { toLspRange } from "./lsp-adapters";
import { renderHover } from "./hover-renderer";
import { wrapHandler } from "./_wrap-handler";
import { withSourceExpressionAtCursor, type SourceExpressionContext } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/hover` for any class expression under the cursor.
 *
 * Dispatches through the unified expression cursor stage.
 * Selector resolution runs through the shared ref query so
 * hover, definition, and rename logic all see the same semantic
 * targets. The resulting selector list is handed to the pure
 * `renderHover` markdown builder. An empty match yields a `null`
 * Hover; an exception is logged by `wrapHandler` and also returns
 * `null`.
 */
export const handleHover = wrapHandler<CursorParams, [maxCandidates?: number], Hover | null>(
  "hover",
  (params, deps, maxCandidates = 10) =>
    withSourceExpressionAtCursor(params, deps, (ctx) =>
      buildHover(ctx, params, deps, maxCandidates),
    ),
  null,
);

function buildHover(
  ctx: SourceExpressionContext,
  params: CursorParams,
  deps: ProviderDeps,
  maxCandidates: number,
): Hover | null {
  const result = resolveRefDetails(ctx, {
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  const markdown = renderHover({
    expression: ctx.expression,
    scssModulePath: ctx.expression.scssModulePath,
    selectors: result.selectors,
    dynamicExplanation: result.dynamicExplanation,
    workspaceRoot: deps.workspaceRoot,
    maxCandidates,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.expression.range),
    contents: { kind: "markdown", value: markdown },
  };
}
