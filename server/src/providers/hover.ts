import type { Hover } from "vscode-languageserver/node";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver.js";
import { toLspRange } from "./lsp-adapters.js";
import { renderHover } from "./hover-renderer.js";
import {
  withCxCallAtCursor,
  type CursorParams,
  type CxCallContext,
  type ProviderDeps,
} from "./provider-utils.js";

/**
 * Handle `textDocument/hover` for a `cx()` call.
 *
 * Dispatches through `withCxCallAtCursor`, resolves the call to
 * its SelectorInfo list, then delegates to the pure
 * `renderHover` markdown builder. Empty match → null Hover;
 * exception → logged and null (spec §2.8 error isolation).
 */
export function handleHover(params: CursorParams, deps: ProviderDeps): Hover | null {
  try {
    return withCxCallAtCursor(params, deps, (ctx) => buildHover(ctx, params, deps));
  } catch (err) {
    deps.logError?.("hover handler failed", err);
    return null;
  }
}

function buildHover(ctx: CxCallContext, params: CursorParams, deps: ProviderDeps): Hover | null {
  const infos = resolveCxCallToSelectorInfos({
    call: ctx.call,
    classMap: ctx.classMap,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  const markdown = renderHover({
    call: ctx.call,
    binding: ctx.binding,
    infos,
    workspaceRoot: deps.workspaceRoot,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.call.originRange),
    contents: { kind: "markdown", value: markdown },
  };
}
