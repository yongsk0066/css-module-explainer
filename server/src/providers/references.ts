import type { Location, ReferenceParams } from "vscode-languageserver/node";
import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { canonicalNameOf } from "../core/scss/classname-transform";
import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { rangeContains } from "./cursor-dispatch";
import type { ProviderDeps } from "./provider-deps";

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

    // The reverse index keys sites by the original SCSS selector
    // name. Under `classnameTransform` modes that expose an alias
    // view (e.g. `btnPrimary` for `.btn-primary`), `info.name` is
    // the alias token; `canonicalNameOf` routes the lookup to the
    // bucket stored under the original source name.
    const sites = findReferenceSites(deps, filePath, canonicalNameOf(info));
    if (sites.length === 0) return null;

    // No expansion filter here — expanded sites are valid Find Refs
    // results (they represent where a rename WOULD edit if the user
    // changed the template/variable resolution). Rename is the only
    // provider that filters `expansion === "expanded"`; see rename.ts.
    return sites.map<Location>((site) => ({
      uri: site.uri,
      range: toLspRange(site.range),
    }));
  },
  null,
);

function findReferenceSites(
  deps: ProviderDeps,
  filePath: string,
  canonicalName: string,
): readonly { readonly uri: string; readonly range: SelectorInfo["range"] }[] {
  const semanticSites = deps.semanticReferenceIndex.findSelectorReferences(filePath, canonicalName);
  if (semanticSites.length > 0) {
    return semanticSites.map((site) => ({
      uri: site.uri,
      range: site.range,
    }));
  }
  return deps.reverseIndex.find(filePath, canonicalName);
}

export function findSelectorAtCursor(
  classMap: ScssClassMap,
  line: number,
  character: number,
): SelectorInfo | null {
  for (const info of classMap.values()) {
    // Prefer the narrower BEM suffix range when present; fall
    // back to the resolved-name range otherwise. Flat entries
    // have no bemSuffix, so they use the resolved range directly.
    const hitRange = info.bemSuffix?.rawTokenRange ?? info.range;
    if (rangeContains(hitRange, line, character)) return info;
  }
  return null;
}
