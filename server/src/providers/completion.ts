import ts from "typescript";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver/node";
import type { CxBinding, SelectorInfo } from "@css-module-explainer/shared";
import { hasCxBindImport, type CursorParams, type ProviderDeps } from "./cursor-dispatch";

/**
 * Handle `textDocument/completion` inside a `cx()` call.
 *
 * Pipeline:
 * 1. Fast-path on `classnames/bind` import.
 * 2. Analyze document → bindings.
 * 3. For each binding whose scope contains the cursor: check
 *    `isInsideCxCall` on `textBefore`.
 * 4. If inside, pull the classMap for that binding and emit
 *    one CompletionItem per class.
 *
 * Multiple bindings in one file (multi-binding) are
 * handled by iterating every in-scope binding and merging
 * results. Typical files have 1 binding so this is O(n) tiny.
 */
export function handleCompletion(
  params: CursorParams,
  deps: ProviderDeps,
): CompletionItem[] | null {
  try {
    return computeCompletion(params, deps);
  } catch (err) {
    deps.logError("completion handler failed", err);
    return null;
  }
}

function computeCompletion(params: CursorParams, deps: ProviderDeps): CompletionItem[] | null {
  // ── Pipeline 1: cx (classnames/bind) ──────────────────────
  if (hasCxBindImport(params.content)) {
    const entry = deps.analysisCache.get(
      params.documentUri,
      params.content,
      params.filePath,
      params.version,
    );
    if (entry.bindings.length > 0) {
      const textBefore = getTextBefore(params.content, params.line, params.character);
      const matchingBinding = findBindingInsideCall(entry.bindings, params.line, textBefore);
      if (matchingBinding) {
        const classMap = deps.scssClassMapForPath(matchingBinding.scssModulePath);
        if (classMap && classMap.size > 0) {
          return Array.from(classMap.values(), (info) => toCompletionItem(info));
        }
      }
    }
  }

  // ── Pipeline 2: clsx / classnames (no /bind) ─────────────
  if (!hasClassUtilImport(params.content)) return null;

  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );

  const classUtilNames = detectClassUtilImports(entry.sourceFile);
  if (classUtilNames.length === 0) return null;

  const textBefore = getTextBefore(params.content, params.line, params.character);

  // Check if cursor is inside any class-util call
  for (const utilName of classUtilNames) {
    if (!isInsideCxCall(textBefore, utilName)) continue;

    // Check if textBefore ends with `<varName>.` or `<varName>.<partial>`
    // for any known style import. Uses simple string check instead of
    // regex to avoid allocation in the hot completion path.
    for (const [varName, scssPath] of entry.stylesBindings) {
      const dotPrefix = varName + ".";
      // Find the last occurrence of `varName.` in textBefore
      const idx = textBefore.lastIndexOf(dotPrefix);
      if (idx < 0) continue;
      // Everything after `varName.` must be a partial identifier (word chars only)
      const afterDot = textBefore.slice(idx + dotPrefix.length);
      if (afterDot.length > 0 && !/^\w+$/.test(afterDot)) continue;
      const classMap = deps.scssClassMapForPath(scssPath);
      if (classMap && classMap.size > 0) {
        return Array.from(classMap.values(), (info) => toCompletionItem(info));
      }
    }
  }

  return null;
}

function findBindingInsideCall(
  bindings: readonly CxBinding[],
  line: number,
  textBefore: string,
): CxBinding | null {
  for (const binding of bindings) {
    if (line < binding.scope.startLine || line > binding.scope.endLine) continue;
    if (isInsideCxCall(textBefore, binding.cxVarName)) return binding;
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
 * Return true when the last `<cxVarName>(` on `textBefore` is
 * still open — i.e. the cursor sits inside the argument list of
 * a cx call.
 *
 * String-aware: parentheses inside `'…'`, `"…"`, or `` `…` ``
 * are ignored. Escaped quotes (backslash) are handled. This
 * means `cx(')')` correctly remains "inside" the call.
 */
export function isInsideCxCall(textBefore: string, cxVarName: string): boolean {
  const needle = `${cxVarName}(`;
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

/**
 * Fast-path predicate: does this document import `clsx`,
 * `clsx/lite`, or `classnames` (not `/bind`)? Used before
 * touching the AST.
 */
function hasClassUtilImport(content: string): boolean {
  return (
    content.includes("'clsx'") ||
    content.includes('"clsx"') ||
    content.includes("'clsx/lite'") ||
    content.includes('"clsx/lite"') ||
    content.includes("'classnames'") ||
    content.includes('"classnames"')
  );
}

/**
 * Scan `sourceFile` for default/named imports from `'clsx'`,
 * `'clsx/lite'`, or `'classnames'` (NOT `'classnames/bind'`).
 * Returns the local identifier names (e.g., `["clsx"]`, `["cn"]`).
 *
 * Used by the completion provider to detect clsx-style calls.
 * Cheap: walks only top-level statements (imports are always
 * top-level in valid TS/JS).
 */
export function detectClassUtilImports(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];
  const targets = new Set(["clsx", "clsx/lite", "classnames"]);
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!targets.has(stmt.moduleSpecifier.text)) continue;
    const defaultName = stmt.importClause?.name?.text;
    if (defaultName) names.push(defaultName);
    const namedBindings = stmt.importClause?.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const spec of namedBindings.elements) {
        names.push(spec.name.text);
      }
    }
  }
  return names;
}
