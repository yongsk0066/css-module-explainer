import type {
  PrepareRenameParams,
  Range as LspRange,
  RenameParams,
  WorkspaceEdit,
} from "vscode-languageserver/node";
import { LSPErrorCodes, ResponseError } from "vscode-languageserver/node";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../../core/hir/style-types";
import { hasBlockingRenameReferences } from "../../core/query/prepare-rename";
import { findCanonicalSelector, findSelectorAtCursor } from "../../core/query/find-style-selector";
import { findLangForPath } from "../../core/scss/lang-registry";
import { fileUrlToPath, pathToFileUrl } from "../../core/util/text-utils";
import { toLspRange } from "../lsp-adapters";
import { wrapHandler } from "../_wrap-handler";
import {
  findSourceExpressionContextAtCursor,
  withSourceExpressionAtCursor,
} from "../cursor-dispatch";
import type { CursorParams, ProviderDeps } from "../provider-deps";
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
export function handlePrepareRename(
  params: PrepareRenameParams,
  deps: ProviderDeps,
  cursorParams?: CursorParams,
): { range: LspRange; placeholder: string } | null {
  try {
    const filePath = fileUrlToPath(params.textDocument.uri);

    if (findLangForPath(filePath)) {
      return prepareRenameFromScss(filePath, params, deps);
    }

    if (!cursorParams) return null;
    const ctx = findSourceExpressionContextAtCursor(cursorParams, deps);
    if (!ctx) return null;

    if (ctx.expression.kind === "template" || ctx.expression.kind === "symbolRef") {
      throwRenameBlocked("Dynamic class expressions cannot be renamed safely.");
    }
    if (ctx.expression.kind !== "literal" && ctx.expression.kind !== "styleAccess") return null;
    return {
      range: toLspRange(ctx.expression.range),
      placeholder: ctx.expression.className,
    };
  } catch (err) {
    if (isResponseError(err)) throw err;
    deps.logError("prepareRename handler failed", err);
    return null;
  }
}

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
      const selector = findSelectorAtExpression(ctx.expression.className, ctx.styleDocument);
      if (!selector) return null;
      return buildRenameEdit(
        pathToFileUrl(ctx.expression.scssModulePath),
        ctx.expression.scssModulePath,
        ctx.styleDocument,
        selector,
        deps,
        params.newName,
      );
    });
  },
  null,
);

/**
 * Resolve the cursor to a selector and reject the nested
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
): { styleDocument: StyleDocumentHIR; selector: SelectorDeclHIR } | null {
  const styleDocument = deps.styleDocumentForPath(filePath);
  if (!styleDocument) return null;

  const selector = findSelectorAtCursor(styleDocument, line, character);
  if (!selector) return null;

  const gateTarget = findCanonicalSelector(styleDocument, selector);
  if (!isRenameSafe(gateTarget)) {
    if (gateTarget.bemSuffix?.rawToken.includes("#{")) {
      throwRenameBlocked("Selectors containing interpolation cannot be renamed safely.");
    }
    throwRenameBlocked("Only flat selectors and safe BEM suffix selectors can be renamed.");
  }

  const mode = deps.settings.scss.classnameTransform;
  if ((mode === "camelCaseOnly" || mode === "dashesOnly") && selector.viewKind === "alias") {
    throwRenameBlocked(
      "Alias selector views cannot be renamed under the current classnameTransform mode.",
    );
  }

  return { styleDocument, selector };
}

function isRenameSafe(selector: SelectorDeclHIR): boolean {
  if (selector.nestedSafety === "flat") return true;
  if (selector.nestedSafety !== "bemSuffixSafe" || !selector.bemSuffix) return false;
  return !selector.bemSuffix.rawToken.includes("#{");
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
  const target = resolveRenameTarget(
    filePath,
    params.position.line,
    params.position.character,
    deps,
  );
  if (!target) return null;

  const canonicalSelector = findCanonicalSelector(target.styleDocument, target.selector);
  const canonicalName = canonicalSelector.canonicalName;
  if (hasExpandedReverseSite(deps, filePath, canonicalName)) {
    throwRenameBlocked(
      "Rename is blocked because inferred or expanded references would make the edit unsafe.",
    );
  }

  const placeholderRange = target.selector.bemSuffix?.rawTokenRange ?? target.selector.range;
  return { range: toLspRange(placeholderRange), placeholder: target.selector.name };
}

function renameFromScss(
  filePath: string,
  params: RenameParams,
  deps: ProviderDeps,
): WorkspaceEdit | null {
  const target = resolveRenameTarget(
    filePath,
    params.position.line,
    params.position.character,
    deps,
  );
  if (!target) return null;

  return buildRenameEdit(
    params.textDocument.uri,
    filePath,
    target.styleDocument,
    target.selector,
    deps,
    params.newName,
  );
}

function findSelectorAtExpression(
  className: string,
  styleDocument: StyleDocumentHIR,
): SelectorDeclHIR | null {
  const selector = styleDocument.selectors.find(
    (candidate): candidate is SelectorDeclHIR => candidate.name === className,
  );
  return selector ?? null;
}

function throwRenameBlocked(message: string): never {
  throw new ResponseError(LSPErrorCodes.RequestFailed, message);
}

function isResponseError(err: unknown): err is ResponseError<unknown> {
  return err instanceof ResponseError;
}
