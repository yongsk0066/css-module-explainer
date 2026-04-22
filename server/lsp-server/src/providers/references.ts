import type { Location, ReferenceParams } from "vscode-languageserver/node";
import { resolveSourceExpressionReferences } from "../../../engine-host-node/src/source-references-query";
import { resolveStyleReferencesAtCursor } from "../../../engine-host-node/src/style-references-query";
import { findLangForPath } from "../../../engine-core-ts/src/core/scss/lang-registry";
import { fileUrlToPath } from "../../../engine-core-ts/src/core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { withSourceExpressionAtCursor } from "./cursor-dispatch";
import type { CursorParams } from "./provider-deps";

/**
 * Handle `textDocument/references` for a class selector inside a
 * `.module.{scss,css}` file.
 *
 * Pipeline:
 * 1. Bail if the file is not a style module.
 * 2. Ask `deps.styleDocumentForPath` — null result also covers
 *    "file missing on disk", so no separate exists-check.
 * 3. Find the selector whose range contains the cursor.
 * 4. Route style-side reference lookup through the Node host boundary.
 * 5. Convert each CallSite to an LSP `Location`.
 *
 * Error isolation is owned by `wrapHandler`.
 */
export const handleReferences = wrapHandler<
  ReferenceParams,
  [cursorParams?: CursorParams],
  Location[] | null
>(
  "references",
  (params, deps, cursorParams) => {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) {
      if (!cursorParams) return null;
      return withSourceExpressionAtCursor(cursorParams, deps, (ctx) => {
        const locations = resolveSourceExpressionReferences(ctx, cursorParams, deps);
        if (locations.length === 0) return null;
        return locations.map<Location>((location) => ({
          uri: location.uri,
          range: toLspRange(location.range),
        }));
      });
    }

    const styleDocument = deps.styleDocumentForPath(filePath);
    if (!styleDocument) return null;

    const locations = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: params.position.line,
        character: params.position.character,
        includeDeclaration: params.context.includeDeclaration,
        styleDocument,
      },
      deps,
    );
    if (locations.length === 0) return null;
    return locations.map<Location>((location) => ({
      uri: location.uri,
      range: toLspRange(location.range),
    }));
  },
  null,
);
export { findSelectorAtCursor } from "../../../engine-core-ts/src/core/query";
