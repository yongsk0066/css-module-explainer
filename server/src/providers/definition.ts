import type { LocationLink } from "vscode-languageserver/node";
import type { Range, SelectorInfo } from "@css-module-explainer/shared";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver";
import { pathToFileUrl } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import {
  withClassRefAtCursor,
  type ClassRefContext,
  type CursorParams,
  type ProviderDeps,
} from "./cursor-dispatch";

/**
 * Handle `textDocument/definition` for any ClassRef under the
 * cursor.
 *
 * Dispatches through the unified `withClassRefAtCursor` front
 * stage (Wave 1 Stage 2) and branches on `ctx.ref.kind`:
 *
 *   - `static`  — single classMap lookup, emits 0 or 1 link.
 *   - `template`/`variable` — delegates to
 *     `resolveCxCallToSelectorInfos` and emits one link per
 *     candidate (multi-match auto-picker in VS Code).
 *
 * Each `SelectorInfo` becomes a `LocationLink`:
 *   - `originSelectionRange` — the class token in source (drives
 *     the underline on the click target)
 *   - `targetUri`            — `file://` URL of the SCSS module
 *   - `targetRange`          — full `{ ... }` rule block (peek preview)
 *   - `targetSelectionRange` — class token range (caret placement)
 *
 * Empty match returns `null`, not `[]`, so other providers can
 * still attempt. The `wrapHandler` boundary ensures a single
 * handler bug never crashes the server (spec section 2.8).
 */
export const handleDefinition = wrapHandler<CursorParams, [], LocationLink[] | null>(
  "definition",
  (params, deps) => withClassRefAtCursor(params, deps, (ctx) => buildLinks(ctx, params, deps)),
  null,
);

function buildLinks(
  ctx: ClassRefContext,
  params: CursorParams,
  deps: ProviderDeps,
): LocationLink[] | null {
  const infos = resolveRefToInfos(ctx, params, deps);
  if (infos.length === 0) return null;
  const targetUri = pathToFileUrl(ctx.ref.scssModulePath);
  return infos.map<LocationLink>((info) => toLocationLink(ctx.ref.originRange, targetUri, info));
}

function resolveRefToInfos(
  ctx: ClassRefContext,
  params: CursorParams,
  deps: ProviderDeps,
): SelectorInfo[] {
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

function toLocationLink(originRange: Range, targetUri: string, info: SelectorInfo): LocationLink {
  return {
    originSelectionRange: toLspRange(originRange),
    targetUri,
    targetRange: toLspRange(info.ruleRange),
    targetSelectionRange: toLspRange(info.range),
  };
}
