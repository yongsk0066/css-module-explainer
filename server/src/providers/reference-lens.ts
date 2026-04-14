import type { CodeLens, CodeLensParams } from "vscode-languageserver/node";
import type { ShowReferencesArgs, ShowReferencesLocation } from "@css-module-explainer/shared";
import { listCanonicalSelectors, readSelectorUsageSummary } from "../core/query";
import type { SelectorDeclHIR } from "../core/hir/style-types";
import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import type { ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/codeLens` on `.module.{scss,css}` files.
 *
 * For every canonical selector in the file, emit a CodeLens anchored
 * at the class token's start position. The command resolves the
 * reference list via the shared reference query at codeLens request
 * time (not at resolve time — `resolveProvider: false`), and
 * invokes VS Code's built-in `editor.action.showReferences`.
 *
 * This handler does not dispatch on a cursor position — it
 * iterates the style document only. The `wrapHandler`
 * boundary captures sync exceptions.
 */
export const handleCodeLens = wrapHandler<CodeLensParams, [], CodeLens[] | null>(
  "codeLens",
  (params, deps) => {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;

    const styleDocument = deps.styleDocumentForPath(filePath);
    if (!styleDocument) return null;

    const lenses: CodeLens[] = [];
    for (const selector of listCanonicalSelectors(styleDocument)) {
      const lens = buildLens(params.textDocument.uri, filePath, selector, deps);
      if (lens) lenses.push(lens);
    }
    return lenses.length > 0 ? lenses : null;
  },
  null,
);

function buildLens(
  uri: string,
  filePath: string,
  selector: SelectorDeclHIR,
  deps: ProviderDeps,
): CodeLens | null {
  const usage = readSelectorUsageSummary(deps, filePath, selector.canonicalName);
  if (!usage.hasAnyReferences) return null;
  const title = formatReferenceLensTitle(usage);
  const locations: ShowReferencesLocation[] = usage.allSites.map((site) => ({
    uri: site.uri,
    range: toLspRange(site.range),
  }));
  // VS Code's built-in `editor.action.showReferences` command takes
  // (uri, position, locations) positionally, so the wire arguments
  // must be a 3-tuple. The `ShowReferencesArgs` contract (shared)
  // documents this shape for both the server and the client
  // middleware (see client/src/extension.ts).
  const args: ShowReferencesArgs = [uri, selector.range.start, locations];
  return {
    range: {
      start: { line: selector.range.start.line, character: selector.range.start.character },
      end: { line: selector.range.start.line, character: selector.range.start.character },
    },
    command: {
      title,
      command: "editor.action.showReferences",
      arguments: [...args],
    },
  };
}

function formatReferenceLensTitle(usage: ReturnType<typeof readSelectorUsageSummary>): string {
  const base = `${usage.totalReferences} reference${usage.totalReferences === 1 ? "" : "s"}`;
  const details: string[] = [];
  if (usage.totalReferences !== usage.directReferenceCount) {
    details.push(`${usage.directReferenceCount} direct`);
  }
  if (usage.hasStyleDependencyReferences) {
    details.push("composed");
  }
  if (usage.hasExpandedReferences) {
    details.push("dynamic");
  }
  return details.length > 0 ? `${base} (${details.join(", ")})` : base;
}
