import type { Hover } from "vscode-languageserver/node";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver";
import { syntheticBindingFromRef } from "../core/util/synthetic-binding";
import { toLspRange } from "./lsp-adapters";
import { renderHover } from "./hover-renderer";
import {
  withCxCallAtCursor,
  withStyleRefAtCursor,
  type CursorParams,
  type CxCallContext,
  type ProviderDeps,
} from "./cursor-dispatch";

/**
 * Handle `textDocument/hover` for a `cx()` call.
 *
 * Dispatches through `withCxCallAtCursor`, resolves the call to
 * its SelectorInfo list, then delegates to the pure
 * `renderHover` markdown builder. Empty match → null Hover;
 * exception → logged and null (error isolation).
 */
export function handleHover(
  params: CursorParams,
  deps: ProviderDeps,
  maxCandidates = 10,
): Hover | null {
  try {
    return (
      withCxCallAtCursor(params, deps, (ctx) => buildHover(ctx, params, deps, maxCandidates)) ??
      withStyleRefAtCursor(params, deps, (ctx) => {
        if (!ctx.info) return null;
        const syntheticBinding = syntheticBindingFromRef(ctx.ref);
        const markdown = renderHover({
          call: {
            kind: "static" as const,
            className: ctx.ref.className,
            originRange: ctx.ref.originRange,
            binding: syntheticBinding,
          },
          binding: syntheticBinding,
          infos: [ctx.info],
          workspaceRoot: deps.workspaceRoot,
        });
        if (!markdown) return null;
        return {
          range: toLspRange(ctx.ref.originRange),
          contents: { kind: "markdown", value: markdown },
        };
      })
    );
  } catch (err) {
    deps.logError("hover handler failed", err);
    return null;
  }
}

function buildHover(
  ctx: CxCallContext,
  params: CursorParams,
  deps: ProviderDeps,
  maxCandidates: number,
): Hover | null {
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
    maxCandidates,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.call.originRange),
    contents: { kind: "markdown", value: markdown },
  };
}
