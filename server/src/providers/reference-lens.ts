import type { CodeLens, CodeLensParams } from "vscode-languageserver/node";
import type {
  SelectorInfo,
  ShowReferencesArgs,
  ShowReferencesLocation,
} from "@css-module-explainer/shared";
import { canonicalNameOf } from "../core/scss/classname-transform";
import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import type { ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/codeLens` on `.module.{scss,css}` files.
 *
 * For every `SelectorInfo` in the file, emit a CodeLens anchored
 * at the class token's start position. The command resolves the
 * reference list via `reverseIndex.find` at codeLens request
 * time (not at resolve time — `resolveProvider: false`), and
 * invokes VS Code's built-in `editor.action.showReferences`.
 *
 * This handler does not dispatch on a cursor position — it
 * iterates the SCSS-side classMap only. The `wrapHandler`
 * boundary captures sync exceptions.
 */
export const handleCodeLens = wrapHandler<CodeLensParams, [], CodeLens[] | null>(
  "codeLens",
  (params, deps) => {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;

    const classMap = deps.scssClassMapForPath(filePath);
    if (!classMap) return null;

    // Under `classnameTransform` modes that expose an alias view,
    // the class map can carry both the original and the alias entry
    // for the same logical class. Iterate once per canonical name
    // so we emit exactly one lens per class regardless of how many
    // views point at it, and so the lookup always hits the
    // canonical-keyed reverse-index bucket.
    const lenses: CodeLens[] = [];
    const emittedCanonical = new Set<string>();
    for (const info of classMap.values()) {
      const canonical = canonicalNameOf(info);
      if (emittedCanonical.has(canonical)) continue;
      emittedCanonical.add(canonical);
      const lens = buildLens(params.textDocument.uri, filePath, info, deps);
      if (lens) lenses.push(lens);
    }
    return lenses.length > 0 ? lenses : null;
  },
  null,
);

function buildLens(
  uri: string,
  filePath: string,
  info: SelectorInfo,
  deps: ProviderDeps,
): CodeLens | null {
  const sites = findReferenceSites(deps, filePath, canonicalNameOf(info));
  if (sites.length === 0) return null;
  const title = `${sites.length} reference${sites.length === 1 ? "" : "s"}`;
  const locations: ShowReferencesLocation[] = sites.map((site) => ({
    uri: site.uri,
    range: toLspRange(site.range),
  }));
  // VS Code's built-in `editor.action.showReferences` command takes
  // (uri, position, locations) positionally, so the wire arguments
  // must be a 3-tuple. The `ShowReferencesArgs` contract (shared)
  // documents this shape for both the server and the client
  // middleware (see client/src/extension.ts).
  const args: ShowReferencesArgs = [uri, info.range.start, locations];
  return {
    range: {
      start: { line: info.range.start.line, character: info.range.start.character },
      end: { line: info.range.start.line, character: info.range.start.character },
    },
    command: {
      title,
      command: "editor.action.showReferences",
      arguments: [...args],
    },
  };
}

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
