import type { LocationLink } from "vscode-languageserver/node";
import type { Range } from "@css-module-explainer/shared";
import {
  findAnimationNameRefAtCursor,
  findCanonicalSelector,
  findComposesTokenAtCursor,
  findKeyframesByName,
  findValueImportAtCursor,
  findValueRefAtCursor,
  resolveComposesTarget,
  resolveValueImportTarget,
  resolveValueTarget,
} from "../../../engine-core-ts/src/core/query";
import type {
  KeyframesDeclHIR,
  SelectorDeclHIR,
  ValueDeclHIR,
} from "../../../engine-core-ts/src/core/hir/style-types";
import { findLangForPath } from "../../../engine-core-ts/src/core/scss/lang-registry";
import { pathToFileUrl } from "../../../engine-core-ts/src/core/util/text-utils";
import { resolveSourceExpressionDefinitionTargets } from "../../../engine-host-node/src/source-definition-query";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { withSourceExpressionAtCursor, type SourceExpressionContext } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/definition` for any class expression under the
 * cursor.
 *
 * Dispatches through the unified expression cursor stage and
 * routes source-side query evaluation through the Node host boundary.
 * Each target becomes a `LocationLink`, which lets VS Code
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
  const targets = resolveSourceExpressionDefinitionTargets(ctx, params.filePath, deps);
  if (targets.length === 0) return null;
  return targets.map<LocationLink>((target) =>
    toLocationLinkFromTarget(
      target.originRange,
      pathToFileUrl(target.targetFilePath),
      target.targetRange,
      target.targetSelectionRange,
    ),
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

function toLocationLinkFromTarget(
  originRange: Range,
  targetUri: string,
  targetRange: Range,
  targetSelectionRange: Range,
): LocationLink {
  return {
    originSelectionRange: toLspRange(originRange),
    targetUri,
    targetRange: toLspRange(targetRange),
    targetSelectionRange: toLspRange(targetSelectionRange),
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

  const valueImport = findValueImportAtCursor(styleDocument, params.line, params.character);
  if (valueImport) {
    const valueTarget = resolveValueImportTarget(
      deps.styleDocumentForPath,
      styleDocument.filePath,
      valueImport,
    );
    if (!valueTarget) return null;
    return [
      toLocationLink(valueImport.range, pathToFileUrl(valueTarget.filePath), valueTarget.valueDecl),
    ];
  }

  const valueRef = findValueRefAtCursor(styleDocument, params.line, params.character);
  if (!valueRef) return null;
  const valueTarget = resolveValueTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    styleDocument,
    valueRef.name,
  );
  if (!valueTarget) return null;
  return [
    toLocationLink(valueRef.range, pathToFileUrl(valueTarget.filePath), valueTarget.valueDecl),
  ];
}
