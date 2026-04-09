import type { Location, ReferenceParams } from "vscode-languageserver/node";
import type { SelectorInfo } from "@css-module-explainer/shared";
import { findLangForPath } from "../core/scss/lang-registry.js";
import { fileUrlToPath } from "../core/util/text-utils.js";
import { toLspRange } from "./lsp-adapters.js";
import type { ProviderDeps } from "./provider-utils.js";

/**
 * Handle `textDocument/references` for a class selector inside a
 * `.module.scss|css` file.
 *
 * Pipeline (spec §4.6):
 * 1. Bail if the file is not a style module.
 * 2. Resolve the class selector the cursor is sitting on by
 *    scanning the file's content via the supplied `readStyleFile`
 *    hook and matching the classMap entry whose `range` contains
 *    the cursor.
 * 3. Ask the ReverseIndex for every `CallSite` that references
 *    that (scssPath, className) pair.
 * 4. Convert each CallSite into an LSP `Location`.
 *
 * Returns `null` when the cursor is not on a class selector,
 * when no references are known, or on exception (spec §2.8).
 */
export function handleReferences(
  params: ReferenceParams,
  readStyleFile: (path: string) => string | null,
  classMapFor: (path: string) => ReadonlyMap<string, SelectorInfo> | null,
  deps: ProviderDeps,
): Location[] | null {
  try {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;
    if (readStyleFile(filePath) === null) return null;

    const classMap = classMapFor(filePath);
    if (!classMap) return null;

    const info = findSelectorAtCursor(classMap, params.position.line, params.position.character);
    if (!info) return null;

    const sites = deps.reverseIndex.find(filePath, info.name);
    if (sites.length === 0) return null;

    return sites.map<Location>((site) => ({
      uri: site.uri,
      range: toLspRange(site.range),
    }));
  } catch (err) {
    deps.logError("references handler failed", err);
    return null;
  }
}

function findSelectorAtCursor(
  classMap: ReadonlyMap<string, SelectorInfo>,
  line: number,
  character: number,
): SelectorInfo | null {
  for (const info of classMap.values()) {
    const { start, end } = info.range;
    if (line < start.line || line > end.line) continue;
    if (line === start.line && character < start.character) continue;
    if (line === end.line && character > end.character) continue;
    return info;
  }
  return null;
}
