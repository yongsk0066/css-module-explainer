import {
  CompletionItemKind,
  type CompletionItem,
  type CompletionParams,
} from "vscode-languageserver/node";
import type { CxBinding, SelectorInfo } from "@css-module-explainer/shared";
import { getLineAt } from "../core/util/text-utils.js";
import { isInsideCxCall, type CursorParams, type ProviderDeps } from "./provider-utils.js";

/**
 * Handle `textDocument/completion` inside a `cx()` call.
 *
 * Pipeline (spec §4.4):
 * 1. Fast-path on `classnames/bind` import.
 * 2. Analyze document → bindings.
 * 3. For each binding whose scope contains the cursor: check
 *    `isInsideCxCall` on `textBefore`.
 * 4. If inside, pull the classMap for that binding and emit
 *    one CompletionItem per class.
 *
 * Multiple bindings in one file (Q7 B #4 — multi-binding) are
 * handled by iterating every in-scope binding and merging
 * results. Typical files have 1 binding so this is O(n) tiny.
 */
export function handleCompletion(
  params: CursorParams,
  _lspParams: CompletionParams,
  deps: ProviderDeps,
): CompletionItem[] | null {
  try {
    return computeCompletion(params, deps);
  } catch (err) {
    deps.logError?.("completion handler failed", err);
    return null;
  }
}

function computeCompletion(params: CursorParams, deps: ProviderDeps): CompletionItem[] | null {
  // Fast path 1 — no classnames/bind import.
  if (!params.content.includes("classnames/bind")) return null;

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
 * Trigger characters for the completion provider. Spec §4.4
 * lists `'`, `"`, `` ` ``, and `,` (controlled by config).
 */
export const COMPLETION_TRIGGER_CHARACTERS = ["'", '"', "`", ","] as const;
