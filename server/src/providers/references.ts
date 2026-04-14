import path from "node:path";
import type { Location, ReferenceParams } from "vscode-languageserver/node";
import {
  findCanonicalSelector,
  findComposesTokenAtCursor,
  findSelectorAtCursor,
} from "../core/query/find-style-selector";
import { readSelectorUsageSummary } from "../core/query/read-selector-usage";
import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";

/**
 * Handle `textDocument/references` for a class selector inside a
 * `.module.{scss,css}` file.
 *
 * Pipeline:
 * 1. Bail if the file is not a style module.
 * 2. Ask `deps.styleDocumentForPath` — null result also covers
 *    "file missing on disk", so no separate exists-check.
 * 3. Find the selector whose range contains the cursor.
 * 4. Ask the shared reference query for every site referencing
 *    that `(scssPath, canonicalName)` pair.
 * 5. Convert each CallSite to an LSP `Location`.
 *
 * Error isolation is owned by `wrapHandler`.
 */
export const handleReferences = wrapHandler<ReferenceParams, [], Location[] | null>(
  "references",
  (params, deps) => {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;

    const styleDocument = deps.styleDocumentForPath(filePath);
    if (!styleDocument) return null;

    const selector = findSelectorAtCursor(
      styleDocument,
      params.position.line,
      params.position.character,
    );
    const composesHit = selector
      ? null
      : findComposesTokenAtCursor(styleDocument, params.position.line, params.position.character);
    const target = selector
      ? {
          filePath,
          canonicalName: selector.canonicalName,
        }
      : resolveComposesTarget(deps, styleDocument.filePath, composesHit);
    if (!target) return null;

    const usage = readSelectorUsageSummary(deps, target.filePath, target.canonicalName);
    if (!usage.hasAnyReferences) return null;

    // No expansion filter here — expanded sites are valid Find Refs
    // results (they represent where a rename WOULD edit if the user
    // changed the template/variable resolution). Rename is the only
    // provider that filters `expansion === "expanded"`; see rename.ts.
    return usage.allSites.map<Location>((site) => ({
      uri: site.uri,
      range: toLspRange(site.range),
    }));
  },
  null,
);
export { findSelectorAtCursor } from "../core/query/find-style-selector";

function resolveComposesTarget(
  deps: Parameters<typeof handleReferences>[1],
  styleFilePath: string,
  hit: ReturnType<typeof findComposesTokenAtCursor>,
): { filePath: string; canonicalName: string } | null {
  if (!hit || hit.ref.fromGlobal) return null;
  const targetFilePath = hit.ref.from
    ? path.resolve(path.dirname(styleFilePath), hit.ref.from)
    : styleFilePath;
  const targetDocument = deps.styleDocumentForPath(targetFilePath);
  if (!targetDocument) return null;
  const selector =
    targetDocument.selectors.find(
      (candidate) =>
        candidate.canonicalName === hit.token.className && candidate.viewKind === "canonical",
    ) ??
    targetDocument.selectors.find((candidate) => candidate.canonicalName === hit.token.className);
  if (!selector) return null;
  return {
    filePath: targetDocument.filePath,
    canonicalName: findCanonicalSelector(targetDocument, selector).canonicalName,
  };
}
