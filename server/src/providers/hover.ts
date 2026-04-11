import type { Hover } from "vscode-languageserver/node";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver";
import { toLspRange } from "./lsp-adapters";
import { renderHover } from "./hover-renderer";
import { wrapHandler } from "./_wrap-handler";
import {
  withClassRefAtCursor,
  type ClassRefContext,
  type CursorParams,
  type ProviderDeps,
} from "./cursor-dispatch";

/**
 * Handle `textDocument/hover` for any ClassRef under the cursor.
 *
 * Dispatches through the unified `withClassRefAtCursor` front
 * stage (Wave 1 Stage 2). For static refs we short-circuit with a
 * single classMap lookup; for template/variable refs we delegate
 * to `resolveCxCallToSelectorInfos`. Either way, the resolved
 * SelectorInfo list is handed to the pure `renderHover` markdown
 * builder. Empty match → null Hover; exception → logged by
 * `wrapHandler` and null.
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
  const infos = resolveRefToInfos(ctx, params, deps);
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

function resolveRefToInfos(ctx: ClassRefContext, params: CursorParams, deps: ProviderDeps) {
  if (ctx.ref.kind === "static") {
    const info = ctx.classMap.get(ctx.ref.className);
    return info ? [info] : [];
  }
  return resolveCxCallToSelectorInfos({
    call: ctx.ref,
    classMap: ctx.classMap,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
}
