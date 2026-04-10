import { CompletionItemKind, type CompletionItem } from "vscode-languageserver/node";
import type { CxBinding, SelectorInfo } from "@css-module-explainer/shared";
import { getLineAt } from "../core/util/text-utils.js";
import { hasCxBindImport, type CursorParams, type ProviderDeps } from "./cursor-dispatch.js";

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
  // Fast path 1 — no classnames/bind import.
  if (!hasCxBindImport(params.content)) return null;

  // Fast path 2 — cursor line has no `(`.
  const line = getLineAt(params.content, params.line);
  if (line === undefined || !line.includes("(")) return null;

  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.bindings.length === 0) return null;

  const textBefore = line.slice(0, params.character);
  const matchingBinding = findBindingInsideCall(entry.bindings, params.line, textBefore);
  if (!matchingBinding) return null;

  const classMap = deps.scssClassMapFor(matchingBinding);
  if (!classMap || classMap.size === 0) return null;

  return Array.from(classMap.values(), (info) => toCompletionItem(info));
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
 * `` ` ``, and `,`.
 */
export const COMPLETION_TRIGGER_CHARACTERS = ["'", '"', "`", ","] as const;

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
