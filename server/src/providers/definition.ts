import type { LocationLink } from "vscode-languageserver/node";
import type { Range } from "@css-module-explainer/shared";
import {
  findAnimationNameRefAtCursor,
  findCanonicalSelector,
  findComposesTokenAtCursor,
  findKeyframesByName,
  findValueDeclByName,
  findValueRefAtCursor,
  readSourceExpressionResolution,
  resolveComposesTarget,
} from "../core/query";
import type { KeyframesDeclHIR, SelectorDeclHIR, ValueDeclHIR } from "../core/hir/style-types";
import { findLangForPath } from "../core/scss/lang-registry";
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
  (params, deps) => {
    if (findLangForPath(params.filePath)) {
      return buildStyleDefinition(params, deps);
    }
    return withSourceExpressionAtCursor(params, deps, (ctx) => buildLinks(ctx, params, deps));
  },
  null,
);

function buildLinks(
  ctx: SourceExpressionContext,
  params: CursorParams,
  deps: ProviderDeps,
): LocationLink[] | null {
  const resolution = readSourceExpressionResolution(
    {
      expression: ctx.expression,
      sourceFile: ctx.entry.sourceFile,
      styleDocument: ctx.styleDocument,
    },
    {
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      filePath: params.filePath,
      workspaceRoot: deps.workspaceRoot,
      sourceBinder: ctx.entry.sourceBinder,
      sourceBindingGraph: ctx.entry.sourceBindingGraph,
    },
  );
  const selectors = resolution.selectors;
  if (selectors.length === 0) return null;
  const styleDocument = resolution.styleDocument;
  if (!styleDocument) return null;
  const targetUri = pathToFileUrl(styleDocument.filePath);
  return selectors.map<LocationLink>((selector) =>
    toLocationLink(ctx.expression.range, targetUri, selector),
  );
}

function toLocationLink(
  originRange: Range,
  targetUri: string,
  target: SelectorDeclHIR | KeyframesDeclHIR | ValueDeclHIR,
): LocationLink {
  return {
    originSelectionRange: toLspRange(originRange),
    targetUri,
    targetRange: toLspRange(target.ruleRange),
    targetSelectionRange: toLspRange(target.range),
  };
}

function buildStyleDefinition(params: CursorParams, deps: ProviderDeps): LocationLink[] | null {
  const styleDocument = deps.styleDocumentForPath(params.filePath);
  if (!styleDocument) return null;

  const hit = findComposesTokenAtCursor(styleDocument, params.line, params.character);
  const target = resolveComposesTarget(deps.styleDocumentForPath, styleDocument.filePath, hit);
  if (hit && target) {
    return [
      toLocationLink(
        hit.token.range,
        pathToFileUrl(target.filePath),
        findCanonicalSelector(target.styleDocument, target.selector),
      ),
    ];
  }

  const animationRef = findAnimationNameRefAtCursor(styleDocument, params.line, params.character);
  if (animationRef) {
    const keyframes = findKeyframesByName(styleDocument, animationRef.name);
    if (!keyframes) return null;
    return [toLocationLink(animationRef.range, pathToFileUrl(styleDocument.filePath), keyframes)];
  }

  const valueRef = findValueRefAtCursor(styleDocument, params.line, params.character);
  if (!valueRef) return null;
  const valueDecl = findValueDeclByName(styleDocument, valueRef.name);
  if (!valueDecl) return null;
  return [toLocationLink(valueRef.range, pathToFileUrl(styleDocument.filePath), valueDecl)];
}
