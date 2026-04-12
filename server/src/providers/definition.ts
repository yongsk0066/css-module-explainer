import type { LocationLink } from "vscode-languageserver/node";
import type { Range, SelectorInfo } from "@css-module-explainer/shared";
import { findDefinitionSelectorInfos } from "../core/query/find-definitions";
import { pathToFileUrl } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { withClassRefAtCursor, type ClassRefContext } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/definition` for any ClassRef under the
 * cursor.
 *
 * Dispatches through the unified `withClassRefAtCursor` front
 * stage and resolves selector targets through the shared ref
 * query. Each target becomes a `LocationLink`, which lets VS Code
 * offer multi-match selection when a ref resolves to more than one
 * selector.
 *
 * Each `SelectorInfo` becomes a `LocationLink`:
 *   - `originSelectionRange` — the class token in source (drives
 *     the underline on the click target)
 *   - `targetUri`            — `file://` URL of the SCSS module
 *   - `targetRange`          — full `{ ... }` rule block (peek preview)
 *   - `targetSelectionRange` — class token range (caret placement)
 *
 * An empty match returns `null` rather than `[]`, so other
 * providers can still attempt. The `wrapHandler` boundary ensures
 * a single handler bug never crashes the server.
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
  const infos = findDefinitionSelectorInfos(ctx, {
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  if (infos.length === 0) return null;
  const targetUri = pathToFileUrl(ctx.ref.scssModulePath);
  return infos.map<LocationLink>((info) => toLocationLink(ctx.ref.originRange, targetUri, info));
}

function toLocationLink(originRange: Range, targetUri: string, info: SelectorInfo): LocationLink {
  return {
    originSelectionRange: toLspRange(originRange),
    targetUri,
    targetRange: toLspRange(info.ruleRange),
    targetSelectionRange: toLspRange(info.range),
  };
}
