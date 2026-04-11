import { CompletionItemKind, type CompletionItem } from "vscode-languageserver/node";
import type { SelectorInfo } from "@css-module-explainer/shared";
import type { AnalysisEntry } from "../core/indexing/document-analysis-cache";
import { hasAnyStyleImport } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";
import { wrapHandler } from "./_wrap-handler";

/**
 * Handle `textDocument/completion` inside a class-util call.
 *
 * Pipeline:
 * 1. Fast-path on `hasAnyStyleImport` — file imports something
 *    we care about (`.module.*` or `classnames/bind`).
 * 2. Fetch the single AnalysisEntry. Bail if it has neither
 *    `bindings` (cx pipeline) nor `stylesBindings` (clsx path).
 * 3. Ask `findCompletionContext` for the SCSS module whose
 *    classMap should feed completions at the cursor. It walks
 *    cx bindings first, then class-util imports.
 * 4. Convert every class in that classMap to a CompletionItem.
 */
export const handleCompletion = wrapHandler<CursorParams, [], CompletionItem[] | null>(
  "completion",
  computeCompletion,
  null,
);

function computeCompletion(params: CursorParams, deps: ProviderDeps): CompletionItem[] | null {
  if (!hasAnyStyleImport(params.content)) return null;

  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.bindings.length === 0 && entry.stylesBindings.size === 0) return null;

  const textBefore = getTextBefore(params.content, params.line, params.character);
  const ctx = findCompletionContext(entry, textBefore, params.line);
  if (!ctx) return null;

  const classMap = deps.scssClassMapForPath(ctx.scssModulePath);
  if (!classMap || classMap.size === 0) return null;

  return Array.from(classMap.values(), toCompletionItem);
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
function findCompletionContext(
  entry: AnalysisEntry,
  textBefore: string,
  line: number,
): CompletionContext | null {
  for (const binding of entry.bindings) {
    if (line < binding.scope.startLine || line > binding.scope.endLine) continue;
    if (isInsideCall(textBefore, binding.cxVarName)) {
      return { scssModulePath: binding.scssModulePath };
    }
  }

  if (entry.classUtilNames.length === 0 || entry.stylesBindings.size === 0) return null;

  for (const utilName of entry.classUtilNames) {
    if (!isInsideCall(textBefore, utilName)) continue;
    // Check if textBefore ends with `<varName>.` or `<varName>.<partial>`
    // for any known style import. Uses simple string check instead of
    // regex to avoid allocation in the hot completion path.
    for (const [varName, styleImport] of entry.stylesBindings) {
      const dotPrefix = `${varName}.`;
      const idx = textBefore.lastIndexOf(dotPrefix);
      if (idx < 0) continue;
      // Everything after `varName.` must be a partial identifier (word chars only).
      const afterDot = textBefore.slice(idx + dotPrefix.length);
      if (afterDot.length > 0 && !/^\w+$/.test(afterDot)) continue;
      return { scssModulePath: styleImport.absolutePath };
    }
  }

  return null;
}

function toCompletionItem(info: SelectorInfo): CompletionItem {
  const detail = info.declarations.trim() || info.fullSelector;
  return {
    label: info.name,
    kind: CompletionItemKind.Value,
    detail,
    documentation: {
      kind: "markdown",
      value: `\`\`\`scss\n.${info.name} { ${info.declarations.trim()} }\n\`\`\``,
    },
    sortText: info.name,
    filterText: info.name,
    insertText: info.name,
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
