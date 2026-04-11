import type { Location, ReferenceParams } from "vscode-languageserver/node";
import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { rangeContains } from "./cursor-dispatch";

/**
 * Handle `textDocument/references` for a class selector inside a
 * `.module.{scss,css}` file.
 *
 * Pipeline:
 * 1. Bail if the file is not a style module.
 * 2. Ask `deps.scssClassMapForPath` — null result also covers
 *    "file missing on disk", so no separate exists-check.
 * 3. Find the SelectorInfo whose `range` contains the cursor.
 * 4. Ask the ReverseIndex for every CallSite referencing that
 *    (scssPath, className) pair.
 * 5. Convert each CallSite to an LSP `Location`.
 *
 * Error isolation is owned by `wrapHandler`.
 */
export const handleReferences = wrapHandler<ReferenceParams, [], Location[] | null>(
  "references",
  (params, deps) => {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;

    const classMap = deps.scssClassMapForPath(filePath);
    if (!classMap) return null;

    const info = findSelectorAtCursor(classMap, params.position.line, params.position.character);
    if (!info) return null;

    const sites = deps.reverseIndex.find(filePath, info.name);
    if (sites.length === 0) return null;

    return sites.map<Location>((site) => ({
      uri: site.uri,
      range: toLspRange(site.range),
    }));
  },
  null,
);

export function findSelectorAtCursor(
  classMap: ScssClassMap,
  line: number,
  character: number,
): SelectorInfo | null {
  for (const info of classMap.values()) {
    if (rangeContains(info.range, line, character)) return info;
  }
  return null;
}
