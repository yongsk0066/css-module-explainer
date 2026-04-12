import type {
  PrepareRenameParams,
  Range as LspRange,
  RenameParams,
  WorkspaceEdit,
} from "vscode-languageserver/node";
import type { BemSuffixInfo, SelectorInfo } from "@css-module-explainer/shared";
import { selectorDeclToLegacySelectorInfo } from "../../core/hir/compat/style-document-compat";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../../core/hir/style-types";
import { hasBlockingRenameReferences } from "../../core/query/prepare-rename";
import { canonicalNameOf } from "../../core/scss/classname-transform";
import { findLangForPath } from "../../core/scss/lang-registry";
import { fileUrlToPath, pathToFileUrl } from "../../core/util/text-utils";
import { toLspRange } from "../lsp-adapters";
import { wrapHandler } from "../_wrap-handler";
import { withSourceExpressionAtCursor } from "../cursor-dispatch";
import type { CursorParams, ProviderDeps } from "../provider-deps";
import { findSelectorAtCursor } from "../references";
import { buildRenameEdit } from "./build-edit";

/**
 * Handle `textDocument/prepareRename`.
 *
 * Returns `{ range, placeholder }` if the cursor sits on a renameable
 * class token, or `null` to reject the rename.
 *
 * Dispatches through the unified expression cursor stage. Only
 * literal class expressions and direct style access are renameable.
 * Template and symbol-ref expressions are rejected so VS Code falls
 * back to its default word-rename behavior instead of editing a
 * dynamic expression.
 */
export const handlePrepareRename = wrapHandler<
  PrepareRenameParams,
  [cursorParams?: CursorParams],
  { range: LspRange; placeholder: string } | null
>(
  "prepareRename",
  (params, deps, cursorParams) => {
    const filePath = fileUrlToPath(params.textDocument.uri);

    if (findLangForPath(filePath)) {
      return prepareRenameFromScss(filePath, params, deps);
    }

    if (!cursorParams) return null;

    return withSourceExpressionAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.expression.kind !== "literal" && ctx.expression.kind !== "styleAccess") return null;
      return {
        range: toLspRange(ctx.expression.range),
        placeholder: ctx.expression.className,
      };
    });
  },
  null,
);

/**
 * Handle `textDocument/rename`.
 *
 * Builds a WorkspaceEdit with text edits across the SCSS file and
 * all referencing TS/TSX files. Only literal class expressions and
 * direct style access are renameable — dynamic expressions are skipped.
 */
export const handleRename = wrapHandler<
  RenameParams,
  [cursorParams?: CursorParams],
  WorkspaceEdit | null
>(
  "rename",
  (params, deps, cursorParams) => {
    const filePath = fileUrlToPath(params.textDocument.uri);

    if (findLangForPath(filePath)) {
      return renameFromScss(filePath, params, deps);
    }

    if (!cursorParams) return null;

    return withSourceExpressionAtCursor(cursorParams, deps, (ctx) => {
      if (ctx.expression.kind !== "literal" && ctx.expression.kind !== "styleAccess") return null;
      const selectorInfo = findSelectorInfoAtExpression(
        ctx.expression.className,
        ctx.styleDocument,
      );
      if (!selectorInfo) return null;
      return buildRenameEdit(
        pathToFileUrl(ctx.expression.scssModulePath),
        ctx.expression.scssModulePath,
        selectorInfo,
        deps,
        params.newName,
      );
    });
  },
  null,
);

/**
 * Resolve the cursor to a `SelectorInfo` and reject the nested
 * shapes that are not safe to rename (shapes outside the BEM
 * suffix set, or whose captured rawToken contains a `#{$var}`
 * interpolation). Shared by both rename entry points so the
 * BEM-safe gate exists in exactly one place.
 */
function resolveRenameTarget(
  filePath: string,
  line: number,
  character: number,
  deps: ProviderDeps,
): SelectorInfo | null {
  const classMap = deps.scssClassMapForPath(filePath);
  if (!classMap) return null;

  const selectorInfo = findSelectorAtCursor(classMap, line, character);
  if (!selectorInfo) return null;

  // Alias unwrap: `classnameTransform` may expose an alias entry
  // at the cursor (e.g. `styles.btnPrimary` when the SCSS has
  // `.btn-primary`). The BEM-safe gate evaluates against the
  // ORIGINAL entry because its `bemSuffix` / `isNested` are the
  // authoritative source — the alias copies them via `...info`
  // spread, so either works in practice, but routing through
  // `originalName` makes the intent explicit and survives future
  // schema changes.
  const gateTarget = selectorInfo.originalName
    ? (classMap.get(selectorInfo.originalName) ?? selectorInfo)
    : selectorInfo;
  if (gateTarget.isNested && !isBemRenameable(gateTarget)) return null;

  const mode = deps.settings.scss.classnameTransform;
  if ((mode === "camelCaseOnly" || mode === "dashesOnly") && selectorInfo.originalName) {
    return null;
  }

  return selectorInfo;
}

function isBemRenameable(info: SelectorInfo): info is SelectorInfo & { bemSuffix: BemSuffixInfo } {
  if (!info.bemSuffix) return false;
  if (info.bemSuffix.rawToken.includes("#{")) return false;
  return true;
}

function hasExpandedReverseSite(
  deps: ProviderDeps,
  filePath: string,
  canonicalName: string,
): boolean {
  return hasBlockingRenameReferences(deps, filePath, canonicalName);
}

function prepareRenameFromScss(
  filePath: string,
  params: PrepareRenameParams,
  deps: ProviderDeps,
): { range: LspRange; placeholder: string } | null {
  const selectorInfo = resolveRenameTarget(
    filePath,
    params.position.line,
    params.position.character,
    deps,
  );
  if (!selectorInfo) return null;

  const canonicalName = canonicalNameOf(selectorInfo);
  if (hasExpandedReverseSite(deps, filePath, canonicalName)) return null;

  const placeholderRange = selectorInfo.bemSuffix?.rawTokenRange ?? selectorInfo.range;
  return { range: toLspRange(placeholderRange), placeholder: selectorInfo.name };
}

function renameFromScss(
  filePath: string,
  params: RenameParams,
  deps: ProviderDeps,
): WorkspaceEdit | null {
  const selectorInfo = resolveRenameTarget(
    filePath,
    params.position.line,
    params.position.character,
    deps,
  );
  if (!selectorInfo) return null;

  return buildRenameEdit(params.textDocument.uri, filePath, selectorInfo, deps, params.newName);
}

function findSelectorInfoAtExpression(
  className: string,
  styleDocument: StyleDocumentHIR,
): SelectorInfo | null {
  const selector = styleDocument.selectors.find(
    (candidate): candidate is SelectorDeclHIR => candidate.name === className,
  );
  return selector ? selectorDeclToLegacySelectorInfo(selector) : null;
}
