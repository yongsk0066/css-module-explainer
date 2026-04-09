import type { CodeLens, CodeLensParams, Location } from "vscode-languageserver/node";
import type { SelectorInfo } from "@css-module-explainer/shared";
import { findLangForPath } from "../core/scss/lang-registry.js";
import { fileUrlToPath } from "../core/util/text-utils.js";
import { toLspRange } from "./lsp-adapters.js";
import type { ProviderDeps } from "./provider-utils.js";

/**
 * Handle `textDocument/codeLens` on `.module.scss|css` files.
 *
 * For every `SelectorInfo` in the file, emit a CodeLens anchored
 * at the class token's start position. The command resolves the
 * reference list via `reverseIndex.find` at codeLens request
 * time (not at resolve time — `resolveProvider: false`), and
 * invokes VS Code's built-in `editor.action.showReferences`.
 *
 * Spec §4.7.
 */
export function handleCodeLens(
  params: CodeLensParams,
  classMapFor: (path: string) => ReadonlyMap<string, SelectorInfo> | null,
  readStyleFile: (path: string) => string | null,
  deps: ProviderDeps,
): CodeLens[] | null {
  try {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;
    if (readStyleFile(filePath) === null) return null;

    const classMap = classMapFor(filePath);
    if (!classMap) return null;

    const lenses: CodeLens[] = [];
    for (const info of classMap.values()) {
      const sites = deps.reverseIndex.find(filePath, info.name);
      const count = sites.length;
      const title = count === 0 ? "no references" : `${count} reference${count === 1 ? "" : "s"}`;
      const locations: Location[] = sites.map((site) => ({
        uri: site.uri,
        range: toLspRange(site.range),
      }));
      lenses.push({
        range: {
          start: { line: info.range.start.line, character: info.range.start.character },
          end: { line: info.range.start.line, character: info.range.start.character },
        },
        command: {
          title,
          command: "editor.action.showReferences",
          arguments: [params.textDocument.uri, info.range.start, locations],
        },
      });
    }
    return lenses;
  } catch (err) {
    deps.logError("code-lens handler failed", err);
    return null;
  }
}
