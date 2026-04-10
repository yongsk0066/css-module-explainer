import type { Hover } from "vscode-languageserver/node";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver.js";
import { toLspRange } from "./lsp-adapters.js";
import { renderHover } from "./hover-renderer.js";
import {
  withCxCallAtCursor,
  withStyleRefAtCursor,
  type CursorParams,
  type CxCallContext,
  type ProviderDeps,
} from "./cursor-dispatch.js";

/**
 * Handle `textDocument/hover` for a `cx()` call.
 *
 * Dispatches through `withCxCallAtCursor`, resolves the call to
 * its SelectorInfo list, then delegates to the pure
 * `renderHover` markdown builder. Empty match → null Hover;
 * exception → logged and null (error isolation).
 */
export function handleHover(params: CursorParams, deps: ProviderDeps): Hover | null {
  try {
    // Try cx() pipeline first, then fall back to styles.x direct access.
    return (
      withCxCallAtCursor(params, deps, (ctx) => buildHover(ctx, params, deps)) ??
      withStyleRefAtCursor(params, deps, (ctx) => {
        if (!ctx.info) return null;
        const markdown = renderHover({
          call: {
            kind: "static",
            className: ctx.ref.className,
            originRange: ctx.ref.originRange,
            binding: {
              cxVarName: ctx.ref.stylesVarName,
              stylesVarName: ctx.ref.stylesVarName,
              scssModulePath: ctx.ref.scssModulePath,
              classNamesImportName: ctx.ref.stylesVarName,
              scope: { startLine: 0, endLine: 99999 },
            },
          },
          binding: {
            cxVarName: ctx.ref.stylesVarName,
            stylesVarName: ctx.ref.stylesVarName,
            scssModulePath: ctx.ref.scssModulePath,
            classNamesImportName: ctx.ref.stylesVarName,
            scope: { startLine: 0, endLine: 99999 },
          },
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
