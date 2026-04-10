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
import {
  withCxCallAtCursor,
  withStyleRefAtCursor,
  type CursorParams,
  type ProviderDeps,
} from "./cursor-dispatch";
import { findSelectorAtCursor } from "./references";

/**
 * Handle `textDocument/prepareRename`.
 *
 * Returns `{ range, placeholder }` if the cursor sits on a renameable
 * class token, or `null` to reject the rename.
 */
export function handlePrepareRename(
  params: PrepareRenameParams,
  deps: ProviderDeps,
  cursorParams?: CursorParams,
): { range: LspRange; placeholder: string } | null {
  try {
    const filePath = fileUrlToPath(params.textDocument.uri);

    // -- SCSS-side: cursor on a selector --
    if (findLangForPath(filePath)) {
      return prepareRenameFromScss(filePath, params, deps);
    }

    // -- TS/TSX-side: needs document content --
    if (!cursorParams) return null;

    // Try cx('class') first
    const cxResult = withCxCallAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.call.kind !== "static") return null;
      return {
        range: toLspRange(ctx.call.originRange),
        placeholder: ctx.call.className,
      };
    });
    if (cxResult) return cxResult;

    // Try styles.class
    const styleRefResult = withStyleRefAtCursor(cursorParams, deps, (ctx) => {
      return {
        range: toLspRange(ctx.ref.originRange),
        placeholder: ctx.ref.className,
      };
    });
    if (styleRefResult) return styleRefResult;

    return null;
  } catch (err) {
    deps.logError("prepareRename handler failed", err);
    return null;
  }
}

/**
 * Handle `textDocument/rename`.
 *
 * Builds a WorkspaceEdit with text edits across the SCSS file and
 * all referencing TS/TSX files.
 */
export function handleRename(
  params: RenameParams,
  deps: ProviderDeps,
  cursorParams?: CursorParams,
): WorkspaceEdit | null {
  try {
    const filePath = fileUrlToPath(params.textDocument.uri);

    // -- SCSS-side --
    if (findLangForPath(filePath)) {
      return renameFromScss(filePath, params, deps);
    }

    // -- TS/TSX-side --
    if (!cursorParams) return null;

    // Try cx('class')
    const cxResult = withCxCallAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.call.kind !== "static") return null;
      const scssPath = ctx.call.binding.scssModulePath;
      const classMap = deps.scssClassMapForPath(scssPath);
      if (!classMap) return null;
      const selectorInfo = classMap.get(ctx.call.className);
      if (!selectorInfo) return null;
      return buildRenameEdit(pathToFileUrl(scssPath), scssPath, selectorInfo, deps, params.newName);
    });
    if (cxResult) return cxResult;

    // Try styles.class
    const styleRefResult = withStyleRefAtCursor(cursorParams, deps, (ctx) => {
      const scssPath = ctx.ref.scssModulePath;
      const classMap = deps.scssClassMapForPath(scssPath);
      if (!classMap) return null;
      const selectorInfo = classMap.get(ctx.ref.className);
      if (!selectorInfo) return null;
      return buildRenameEdit(pathToFileUrl(scssPath), scssPath, selectorInfo, deps, params.newName);
    });
    if (styleRefResult) return styleRefResult;

    return null;
  } catch (err) {
    deps.logError("rename handler failed", err);
    return null;
  }
}

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
  return buildRenameEdit(params.textDocument.uri, filePath, selectorInfo, deps, params.newName);
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

  // 2. TS/TSX reference edits from the reverse index
  const sites = deps.reverseIndex.find(scssPath, selectorInfo.name);
  for (const site of sites) {
    if (!changes[site.uri]) changes[site.uri] = [];
    changes[site.uri]!.push({
      range: toLspRange(site.range),
      newText: newName,
    });
  }

  return { changes };
}
