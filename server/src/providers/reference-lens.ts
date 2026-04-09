import type { CodeLens, CodeLensParams, Location } from "vscode-languageserver/node";
import type { SelectorInfo } from "@css-module-explainer/shared";
import { findLangForPath } from "../core/scss/lang-registry.js";
import { fileUrlToPath } from "../core/util/text-utils.js";
import { toLspRange } from "./lsp-adapters.js";
import type { ProviderDeps } from "./provider-utils.js";

/**
 * Handle `textDocument/codeLens` on `.module.{scss,css}` files.
 *
 * For every `SelectorInfo` in the file, emit a CodeLens anchored
 * at the class token's start position. The command resolves the
 * reference list via `reverseIndex.find` at codeLens request
 * time (not at resolve time — `resolveProvider: false`), and
 * invokes VS Code's built-in `editor.action.showReferences`.
 */
export function handleCodeLens(params: CodeLensParams, deps: ProviderDeps): CodeLens[] | null {
  try {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;

    const classMap = deps.scssClassMapForPath(filePath);
    if (!classMap) return null;

    return Array.from(classMap.values(), (info) =>
      buildLens(params.textDocument.uri, filePath, info, deps),
    );
  } catch (err) {
    deps.logError("code-lens handler failed", err);
    return null;
  }
}

function buildLens(
  uri: string,
  filePath: string,
  info: SelectorInfo,
  deps: ProviderDeps,
): CodeLens {
  const sites = deps.reverseIndex.find(filePath, info.name);
  const count = sites.length;
  const title = count === 0 ? "no references" : `${count} reference${count === 1 ? "" : "s"}`;
  const locations: Location[] = sites.map((site) => ({
    uri: site.uri,
    range: toLspRange(site.range),
  }));
  return {
    range: {
      start: { line: info.range.start.line, character: info.range.start.character },
      end: { line: info.range.start.line, character: info.range.start.character },
    },
    command: {
      title,
      command: "editor.action.showReferences",
      arguments: [uri, info.range.start, locations],
    },
  };
}
