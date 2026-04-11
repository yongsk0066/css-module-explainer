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

  // Nested entries require the full BEM-safe trio to be populated
  // by the parser. Absence of any one means the parser refused to
  // classify this as a safe rename (compound `&.x`, pseudo
  // `&:hover`, multi-`&`, grouped parent, non-bare parent). Fall
  // back to the Wave 1 reject behavior for those shapes.
  if (selectorInfo.isNested) {
    if (!selectorInfo.rawTokenRange || !selectorInfo.rawToken || !selectorInfo.parentResolvedName) {
      return null;
    }
    // Interpolation reject — suffix-math cannot see through
    // `#{$var}`. In practice extractClassNames already filters
    // interpolated forms, so this is defensive.
    if (selectorInfo.rawToken.includes("#{")) return null;
  }

  // Reject if any reverse-index site for this class is a synthesized
  // expansion of a template/variable ref. Rewriting those entries
  // would destroy the dynamic expression source. Find References
  // still surfaces expanded sites — only rename filters. This guard
  // must fire for nested BEM entries too (their resolved class name
  // may still appear in a template call site that expanded to it).
  const expandedSites = deps.reverseIndex
    .findAllForScssPath(filePath)
    .filter(
      (s) =>
        s.match.kind === "static" &&
        s.match.className === selectorInfo.name &&
        s.expansion !== "direct",
    );
  if (expandedSites.length > 0) return null;

  // Use the narrower raw-token range for the placeholder when the
  // entry is nested (covers `&--primary` exactly); flat entries keep
  // their resolved range.
  const placeholderRange = selectorInfo.rawTokenRange ?? selectorInfo.range;
  return { range: toLspRange(placeholderRange), placeholder: selectorInfo.name };
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

  // Same trio gate as prepareRename — defensive parity so renameFromScss
  // refuses when called out of order.
  if (selectorInfo.isNested) {
    if (!selectorInfo.rawTokenRange || !selectorInfo.rawToken || !selectorInfo.parentResolvedName) {
      return null;
    }
    if (selectorInfo.rawToken.includes("#{")) return null;
  }

  return buildRenameEdit(params.textDocument.uri, filePath, selectorInfo, deps, params.newName);
}

function buildRenameEdit(
  scssUri: string,
  scssPath: string,
  selectorInfo: SelectorInfo,
  deps: ProviderDeps,
  newName: string,
): WorkspaceEdit | null {
  const changes: Record<string, Array<{ range: LspRange; newText: string }>> = {};

  // 1. SCSS selector edit — flat uses the resolved range; BEM-safe
  //    nested uses the suffix sub-range inside rawToken.
  const scssEdit = selectorInfo.isNested
    ? buildNestedScssEdit(selectorInfo, newName)
    : buildFlatScssEdit(selectorInfo, newName);
  if (!scssEdit) return null;
  changes[scssUri] = [scssEdit];

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

const IDENTIFIER_RE = /^[a-zA-Z_][\w-]*$/;

function buildFlatScssEdit(
  selectorInfo: SelectorInfo,
  newName: string,
): { range: LspRange; newText: string } | null {
  if (!IDENTIFIER_RE.test(newName)) return null;
  return { range: toLspRange(selectorInfo.range), newText: newName };
}

function buildNestedScssEdit(
  selectorInfo: SelectorInfo,
  newName: string,
): { range: LspRange; newText: string } | null {
  // Trio is guaranteed non-null by prepareRenameFromScss. The
  // destructuring narrowing below is TypeScript hygiene, not a
  // second runtime gate — keeping it avoids propagating `!` asserts.
  const { parentResolvedName: parent, rawToken, rawTokenRange: rawRange } = selectorInfo;
  if (!parent || !rawToken || !rawRange) return null;

  if (!IDENTIFIER_RE.test(newName)) return null;

  // Cross-parent rename → reject in MVP.
  if (!selectorInfo.name.startsWith(parent)) return null;
  if (!newName.startsWith(parent)) return null;

  const oldSuffix = selectorInfo.name.slice(parent.length);
  const newSuffix = newName.slice(parent.length);

  // Reject no-op (rename-to-same) and empty-suffix (bare `&`).
  if (oldSuffix === newSuffix) return null;
  if (newSuffix.length === 0) return null;

  // Parser invariant: rawToken === "&" + oldSuffix, so suffixOffset
  // must be 1. The check below is defense-in-depth — if the parser
  // somehow produced a different shape we'd rather bail than write
  // wrong bytes.
  const suffixOffset = rawToken.indexOf(oldSuffix);
  if (suffixOffset !== 1) return null;

  const suffixRange: LspRange = {
    start: {
      line: rawRange.start.line,
      character: rawRange.start.character + suffixOffset,
    },
    end: {
      line: rawRange.start.line,
      character: rawRange.start.character + suffixOffset + oldSuffix.length,
    },
  };
  return { range: suffixRange, newText: newSuffix };
}
