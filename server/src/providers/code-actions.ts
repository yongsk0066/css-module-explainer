import {
  CodeActionKind,
  type CodeAction,
  type CodeActionParams,
  type Diagnostic,
  type WorkspaceEdit,
} from "vscode-languageserver/node";
import type { ProviderDeps } from "./provider-utils.js";

/**
 * Handle `textDocument/codeAction` for Plan 09 diagnostics.
 *
 * Consumes `Diagnostic.data.suggestion` attached by the diagnostics
 * provider and returns one `CodeAction` per suggestion that rewrites
 * the flagged range to the suggested class name. Spec §4.5b.
 *
 * Pure function over LSP params: no AST, no file I/O, no cache
 * lookups. This is the cheapest provider in the codebase — the
 * heavy lifting already happened at diagnostic publish time.
 */
export function handleCodeAction(
  params: CodeActionParams,
  deps: ProviderDeps,
): CodeAction[] | null {
  try {
    const actions: CodeAction[] = [];
    for (const diagnostic of params.context.diagnostics) {
      const suggestion = extractSuggestion(diagnostic);
      if (!suggestion) continue;
      actions.push(buildQuickFix(params.textDocument.uri, diagnostic, suggestion));
    }
    return actions.length > 0 ? actions : null;
  } catch (err) {
    deps.logError("code-action handler failed", err);
    return null;
  }
}

function extractSuggestion(diagnostic: Diagnostic): string | null {
  const data = diagnostic.data;
  if (data === null || typeof data !== "object") return null;
  const suggestion = (data as { suggestion?: unknown }).suggestion;
  return typeof suggestion === "string" && suggestion.length > 0 ? suggestion : null;
}

function buildQuickFix(uri: string, diagnostic: Diagnostic, suggestion: string): CodeAction {
  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [
        {
          range: diagnostic.range,
          newText: suggestion,
        },
      ],
    },
  };
  return {
    title: `Replace with '${suggestion}'`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit,
    isPreferred: true,
  };
}
