import type {
  PrepareRenameParams,
  Range as LspRange,
  RenameParams,
  WorkspaceEdit,
} from "vscode-languageserver/node";
import { LSPErrorCodes, ResponseError } from "vscode-languageserver/node";
import {
  groupTextEditsByUri,
  renameBlockReasonMessage,
} from "../../../../engine-core-ts/src/core/rewrite";
import {
  planSourceExpressionRename,
  readSourceExpressionRenameTarget,
} from "../../../../engine-host-node/src/source-rename-query";
import {
  planStyleRenameAtCursor,
  readStyleRenameTargetAtCursor,
} from "../../../../engine-host-node/src/style-rename-query";
import { findLangForPath } from "../../../../engine-core-ts/src/core/scss/lang-registry";
import { fileUrlToPath } from "../../../../engine-core-ts/src/core/util/text-utils";
import { toLspRange } from "../lsp-adapters";
import { wrapHandler } from "../_wrap-handler";
import { findSourceExpressionContextAtCursor } from "../cursor-dispatch";
import type { CursorParams, ProviderDeps } from "../provider-deps";

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
      const styleDocument = deps.styleDocumentForPath(filePath);
      if (!styleDocument) return null;
      return toPrepareRenameResult(
        readStyleRenameTargetAtCursor(
          filePath,
          params.position.line,
          params.position.character,
          styleDocument,
          deps,
        ),
      );
    }

    if (!cursorParams) return null;
    const ctx = findSourceExpressionContextAtCursor(cursorParams, deps);
    if (!ctx) return null;
    return toPrepareRenameResult(readSourceExpressionRenameTarget(ctx, cursorParams, deps));
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
      const styleDocument = deps.styleDocumentForPath(filePath);
      if (!styleDocument) return null;
      return toWorkspaceEdit(
        planStyleRenameAtCursor(
          filePath,
          params.position.line,
          params.position.character,
          styleDocument,
          deps,
          params.newName,
        ),
      );
    }

    if (!cursorParams) return null;
    const ctx = findSourceExpressionContextAtCursor(cursorParams, deps);
    if (!ctx) return null;
    return toWorkspaceEdit(planSourceExpressionRename(ctx, cursorParams, deps, params.newName));
  },
  null,
);

function throwRenameBlocked(message: string): never {
  throw new ResponseError(LSPErrorCodes.RequestFailed, message);
}

function isResponseError(err: unknown): err is ResponseError<unknown> {
  return err instanceof ResponseError;
}

function toPrepareRenameResult(
  result:
    | ReturnType<typeof readStyleRenameTargetAtCursor>
    | ReturnType<typeof readSourceExpressionRenameTarget>,
): { range: LspRange; placeholder: string } | null {
  if (result.kind === "miss") return null;
  if (result.kind === "blocked") {
    throwRenameBlocked(renameBlockReasonMessage(result.reason));
  }
  return {
    range: toLspRange(result.target.placeholderRange),
    placeholder: result.target.placeholder,
  };
}

function toWorkspaceEdit(
  plan:
    | ReturnType<typeof planSourceExpressionRename>
    | ReturnType<typeof planStyleRenameAtCursor>
    | null,
): WorkspaceEdit | null {
  if (!plan || plan.kind !== "plan") return null;

  const changes: WorkspaceEdit["changes"] = {};
  for (const [uri, edits] of groupTextEditsByUri(plan.plan.edits)) {
    changes[uri] = edits.map((edit) => ({
      range: toLspRange(edit.range),
      newText: edit.newText,
    }));
  }
  return { changes };
}
