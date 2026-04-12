import type { LocationLink } from "vscode-languageserver/node";
import type { Range } from "@css-module-explainer/shared";
import { findDefinitionSelectors } from "../core/query/find-definitions";
import type { SelectorDeclHIR } from "../core/hir/style-types";
import { pathToFileUrl } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { withSourceExpressionAtCursor, type SourceExpressionContext } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/definition` for any class expression under the
 * cursor.
 *
 * Dispatches through the unified expression cursor stage and
 * resolves selector targets through the shared ref
 * query. Each target becomes a `LocationLink`, which lets VS Code
 * offer multi-match selection when a ref resolves to more than one
 * selector.
 *
 * Each selector becomes a `LocationLink`:
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
  (params, deps) =>
    withSourceExpressionAtCursor(params, deps, (ctx) => buildLinks(ctx, params, deps)),
  null,
);

function buildLinks(
  ctx: SourceExpressionContext,
  params: CursorParams,
  deps: ProviderDeps,
): LocationLink[] | null {
  const selectors = findDefinitionSelectors(ctx, {
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  if (selectors.length === 0) return null;
  const targetUri = pathToFileUrl(ctx.expression.scssModulePath);
  return selectors.map<LocationLink>((selector) =>
    toLocationLink(ctx.expression.range, targetUri, selector),
  );
}

function toLocationLink(
  originRange: Range,
  targetUri: string,
  selector: SelectorDeclHIR,
): LocationLink {
  return {
    originSelectionRange: toLspRange(originRange),
    targetUri,
    targetRange: toLspRange(selector.ruleRange),
    targetSelectionRange: toLspRange(selector.range),
  };
}
