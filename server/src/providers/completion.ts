import { CompletionItemKind, type CompletionItem } from "vscode-languageserver/node";
import type { AnalysisEntry } from "../core/indexing/document-analysis-cache";
import type { SelectorDeclHIR } from "../core/hir/style-types";
import { getDeclById, resolveIdentifierAtOffset } from "../core/binder/binder-builder";
import type { CursorParams, ProviderDeps } from "./provider-deps";
import { wrapHandler } from "./_wrap-handler";

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
  const ctx = findCompletionContext(entry, textBefore);
  if (!ctx) return null;

  const styleDocument = deps.styleDocumentForPath(ctx.scssModulePath);
  if (!styleDocument || styleDocument.selectors.length === 0) return null;

  return styleDocument.selectors.map(toCompletionItem);
}

interface CompletionContext {
  readonly scssModulePath: string;
}

/**
 * Locate the SCSS module whose classes the cursor should complete.
 *
 * Pass 1 — cx bindings: every `classnames/bind` binding in scope
 * whose cx call is still open at the cursor.
 *
 * Pass 2 — class-util calls: for each `clsx` / `classnames` import,
 * if the cursor sits inside that call AND `textBefore` ends with
 * `<stylesVar>.<partial>` for any known style import, that style
 * import's resolved path wins.
 *
 * First hit wins; returns `null` when nothing matches.
 */
function findCompletionContext(entry: AnalysisEntry, textBefore: string): CompletionContext | null {
  for (const binding of entry.sourceDocument.utilityBindings) {
    if (binding.kind !== "classnamesBind") continue;
    const callOffset = findOpenCallOffset(textBefore, binding.localName);
    if (callOffset === null) continue;
    const resolution = resolveIdentifierAtOffset(entry.sourceBinder, binding.localName, callOffset);
    const decl = resolution ? getDeclById(entry.sourceBinder, resolution.declId) : null;
    if (!decl) continue;
    if (binding.bindingDeclId !== decl.id) continue;
    if (isInsideCall(textBefore, binding.localName)) {
      return { scssModulePath: binding.scssModulePath };
    }
  }

  const classUtilBindings = entry.sourceDocument.utilityBindings.filter(
    (binding) => binding.kind === "classUtil",
  );
  if (classUtilBindings.length === 0 || entry.sourceDocument.styleImports.length === 0) return null;

  for (const binding of classUtilBindings) {
    const callOffset = findOpenCallOffset(textBefore, binding.localName);
    if (callOffset === null) continue;
    const resolution = resolveIdentifierAtOffset(entry.sourceBinder, binding.localName, callOffset);
    const decl = resolution ? getDeclById(entry.sourceBinder, resolution.declId) : null;
    if (!decl || binding.bindingDeclId !== decl.id) continue;
    if (!isInsideCall(textBefore, binding.localName)) continue;
    // Check if textBefore ends with `<varName>.` or `<varName>.<partial>`
    // for any known style import. Uses simple string check instead of
    // regex to avoid allocation in the hot completion path.
    for (const styleImport of entry.sourceDocument.styleImports) {
      if (styleImport.resolved.kind !== "resolved") continue;
      const varName = styleImport.localName;
      const dotPrefix = `${varName}.`;
      const idx = textBefore.lastIndexOf(dotPrefix);
      if (idx < 0) continue;
      // Everything after `varName.` must be a partial identifier (word chars only).
      const afterDot = textBefore.slice(idx + dotPrefix.length);
      if (afterDot.length > 0 && !/^\w+$/.test(afterDot)) continue;
      return { scssModulePath: styleImport.resolved.absolutePath };
    }
  }

  return null;
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
export function isInsideCall(textBefore: string, callName: string): boolean {
  const needle = `${callName}(`;
  const callIdx = textBefore.lastIndexOf(needle);
  if (callIdx === -1) return false;

  let depth = 1;
  let quote: string | null = null;
  for (let i = callIdx + needle.length; i < textBefore.length; i += 1) {
    const ch = textBefore[i]!;
    // Inside a quoted string — skip until the matching close quote.
    if (quote) {
      if (ch === quote && textBefore[i - 1] !== "\\") quote = null;
      continue;
    }
    // Opening a string literal.
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return false;
    }
  }
  return depth > 0;
}

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

function findOpenCallOffset(textBefore: string, callName: string): number | null {
  const needle = `${callName}(`;
  const callIdx = textBefore.lastIndexOf(needle);
  if (callIdx === -1) return null;
  if (!isInsideCall(textBefore, callName)) return null;
  return callIdx;
}
