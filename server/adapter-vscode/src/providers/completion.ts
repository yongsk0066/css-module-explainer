import { CompletionItemKind, type CompletionItem } from "vscode-languageserver/node";
import type { SelectorDeclHIR } from "../../../src/core/hir/style-types";
import { readCompletionContext } from "../../../src/core/query";
import type { CursorParams, ProviderDeps } from "./provider-deps";
import { wrapHandler } from "./_wrap-handler";
export { isInsideCall } from "../../../src/core/query";

/**
 * Handle `textDocument/completion` inside a class-util call.
 *
 * Pipeline:
 * 1. Fetch the single AnalysisEntry. Bail if it has neither
 *    `bindings` (cx pipeline) nor `stylesBindings` (clsx path).
 * 2. Ask `findCompletionContext` for the SCSS module whose
 *    style document should feed completions at the cursor. It walks
 *    cx bindings first, then class-util imports.
 * 3. Convert every selector in that style document to a CompletionItem.
 */
export const handleCompletion = wrapHandler<CursorParams, [], CompletionItem[] | null>(
  "completion",
  computeCompletion,
  null,
);

function computeCompletion(params: CursorParams, deps: ProviderDeps): CompletionItem[] | null {
  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (
    entry.sourceDocument.utilityBindings.length === 0 &&
    entry.sourceDocument.styleImports.length === 0
  ) {
    return null;
  }

  const textBefore = getTextBefore(params.content, params.line, params.character);
  const ctx = readCompletionContext(entry, textBefore);
  if (!ctx) return null;

  const styleDocument = deps.styleDocumentForPath(ctx.scssModulePath);
  if (!styleDocument || styleDocument.selectors.length === 0) return null;

  return styleDocument.selectors.map(toCompletionItem);
}

function toCompletionItem(selector: SelectorDeclHIR): CompletionItem {
  const detail = selector.declarations.trim() || selector.fullSelector;
  return {
    label: selector.name,
    kind: CompletionItemKind.Value,
    detail,
    documentation: {
      kind: "markdown",
      value: `\`\`\`scss\n.${selector.name} { ${selector.declarations.trim()} }\n\`\`\``,
    },
    sortText: selector.name,
    filterText: selector.name,
    insertText: selector.name,
  };
}

/**
 * Trigger characters for the completion provider: `'`, `"`,
 * `` ` ``, `,`, and `.`.
 *
 * The `.` trigger is needed for `styles.` inside clsx/classnames
 * calls where completion must fire on the dot.
 */
export const COMPLETION_TRIGGER_CHARACTERS = ["'", '"', "`", ",", "."] as const;

/**
 * Return true when the last `<name>(` on `textBefore` is still
 * open — i.e. the cursor sits inside the argument list of that
 * call. Used for both `cx(` (classnames/bind) and `clsx(` /
 * `classnames(` (clsx-style) detection.
 *
 * String-aware: parentheses inside `'…'`, `"…"`, or `` `…` ``
 * are ignored. Escaped quotes (backslash) are handled. This
 * means `cx(')')` correctly remains "inside" the call.
 */
/** All text from file start to (line, character). */
function getTextBefore(content: string, line: number, character: number): string {
  let offset = 0;
  for (let i = 0; i < line; i++) {
    const nl = content.indexOf("\n", offset);
    if (nl === -1) return content;
    offset = nl + 1;
  }
  return content.slice(0, offset + character);
}
