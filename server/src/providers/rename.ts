import type {
  PrepareRenameParams,
  Range as LspRange,
  RenameParams,
  WorkspaceEdit,
} from "vscode-languageserver/node";
import type { SelectorInfo } from "@css-module-explainer/shared";
import { findLangForPath } from "../core/scss/lang-registry";
import { fileUrlToPath, pathToFileUrl } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import { withClassRefAtCursor } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";
import { findSelectorAtCursor } from "./references";

/**
 * Handle `textDocument/prepareRename`.
 *
 * Returns `{ range, placeholder }` if the cursor sits on a renameable
 * class token, or `null` to reject the rename.
 *
 * Dispatches through the unified `withClassRefAtCursor` front stage.
 * Only `static` refs are renameable — template and variable refs are
 * rejected here so VS Code falls back to its default word-rename
 * behavior instead of editing a dynamic expression.
 */
export const handlePrepareRename = wrapHandler<
  PrepareRenameParams,
  [cursorParams?: CursorParams],
  { range: LspRange; placeholder: string } | null
>(
  "prepareRename",
  (params, deps, cursorParams) => {
    const filePath = fileUrlToPath(params.textDocument.uri);

    // -- SCSS-side: cursor on a selector --
    if (findLangForPath(filePath)) {
      return prepareRenameFromScss(filePath, params, deps);
    }

    // -- TS/TSX-side: needs document content --
    if (!cursorParams) return null;

    return withClassRefAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.ref.kind !== "static") return null;
      return {
        range: toLspRange(ctx.ref.originRange),
        placeholder: ctx.ref.className,
      };
    });
  },
  null,
);

/**
 * Handle `textDocument/rename`.
 *
 * Builds a WorkspaceEdit with text edits across the SCSS file and
 * all referencing TS/TSX files. Only `static` class refs are
 * renameable — dynamic (template/variable) refs are skipped.
 */
export const handleRename = wrapHandler<
  RenameParams,
  [cursorParams?: CursorParams],
  WorkspaceEdit | null
>(
  "rename",
  (params, deps, cursorParams) => {
    const filePath = fileUrlToPath(params.textDocument.uri);

    // -- SCSS-side --
    if (findLangForPath(filePath)) {
      return renameFromScss(filePath, params, deps);
    }

    // -- TS/TSX-side --
    if (!cursorParams) return null;

    return withClassRefAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.ref.kind !== "static") return null;
      const selectorInfo = ctx.classMap.get(ctx.ref.className);
      if (!selectorInfo) return null;
      return buildRenameEdit(
        pathToFileUrl(ctx.ref.scssModulePath),
        ctx.ref.scssModulePath,
        selectorInfo,
        deps,
        params.newName,
      );
    });
  },
  null,
);

// -- SCSS-side helpers --

function prepareRenameFromScss(
  filePath: string,
  params: PrepareRenameParams,
  deps: ProviderDeps,
): { range: LspRange; placeholder: string } | null {
  const classMap = deps.scssClassMapForPath(filePath);
  if (!classMap) return null;
  const selectorInfo = findSelectorAtCursor(
    classMap,
    params.position.line,
    params.position.character,
  );
  if (!selectorInfo) return null;

  // Defensively reject `&`-nested selectors. Their range is
  // synthesized from the resolved class name and may span past
  // the `&--primary` source into whitespace, silently corrupting
  // the rewrite. A future structured raw-token range will lift
  // this restriction.
  if (isNestedSelector(selectorInfo)) return null;

  // Reject if any reverse-index site for this class is a synthesized
  // expansion of a template/variable ref. Rewriting those entries
  // would destroy the dynamic expression source. Find References
  // still surfaces expanded sites — only rename filters.
  const expandedSites = deps.reverseIndex
    .findAllForScssPath(filePath)
    .filter(
      (s) =>
        s.match.kind === "static" &&
        s.match.className === selectorInfo.name &&
        s.expansion !== "direct",
    );
  if (expandedSites.length > 0) return null;

  return { range: toLspRange(selectorInfo.range), placeholder: selectorInfo.name };
}

function renameFromScss(
  filePath: string,
  params: RenameParams,
  deps: ProviderDeps,
): WorkspaceEdit | null {
  const classMap = deps.scssClassMapForPath(filePath);
  if (!classMap) return null;
  const selectorInfo = findSelectorAtCursor(
    classMap,
    params.position.line,
    params.position.character,
  );
  if (!selectorInfo) return null;
  if (isNestedSelector(selectorInfo)) return null;
  return buildRenameEdit(params.textDocument.uri, filePath, selectorInfo, deps, params.newName);
}

/**
 * True if the selector was produced from a `&`-nested SCSS rule.
 * The parser sets `isNested: true` when the raw source contained `&`;
 * in that case `SelectorInfo.range` is a synthesized fallback that
 * points at the `&` column with the resolved class name's length and
 * is unsafe to rewrite. These rules are currently rejected outright;
 * proper support will require a structured raw-token range in the
 * parser output.
 */
function isNestedSelector(info: SelectorInfo): boolean {
  return info.isNested === true;
}

function buildRenameEdit(
  scssUri: string,
  scssPath: string,
  selectorInfo: SelectorInfo,
  deps: ProviderDeps,
  newName: string,
): WorkspaceEdit {
  const changes: Record<string, Array<{ range: LspRange; newText: string }>> = {};

  // 1. SCSS selector edit
  changes[scssUri] = [{ range: toLspRange(selectorInfo.range), newText: newName }];

  // 2. TS/TSX reference edits from the reverse index.
  //
  // Filter out `expansion: "expanded"` sites. Those are synthesized
  // from template/variable refs and carry the whole dynamic
  // expression's range — rewriting them would destroy the template
  // literal or variable identifier source. Find References still
  // returns expanded sites (see references.ts); only rename refuses
  // to touch them.
  const sites = deps.reverseIndex.find(scssPath, selectorInfo.name);
  for (const site of sites) {
    if (site.expansion !== "direct") continue;
    (changes[site.uri] ??= []).push({
      range: toLspRange(site.range),
      newText: newName,
    });
  }

  return { changes };
}
