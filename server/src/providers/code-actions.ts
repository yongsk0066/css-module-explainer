import {
  CodeActionKind,
  type CodeAction,
  type CodeActionParams,
  type CreateFile,
  type Diagnostic,
  type Range as LspRange,
  type WorkspaceEdit,
} from "vscode-languageserver/node";
import { isRecord } from "../core/util/value-guards";
import { wrapHandler } from "./_wrap-handler";
import type { ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/codeAction` by emitting quickfixes from
 * diagnostic suggestions.
 *
 * Consumes `Diagnostic.data.suggestion` attached by the
 * diagnostics provider and returns one `CodeAction` per
 * suggestion that rewrites the flagged range to the suggested
 * class name.
 *
 * Pure function over LSP params: no AST, no file I/O, no cache
 * lookups. The heavy lifting already happened at diagnostic
 * publish time. Error isolation is owned by `wrapHandler`.
 */
export const handleCodeAction = wrapHandler<CodeActionParams, [], CodeAction[] | null>(
  "codeAction",
  (params, _deps: ProviderDeps) => {
    const actions: CodeAction[] = [];
    for (const diagnostic of params.context.diagnostics) {
      const suggestion = extractSuggestion(diagnostic);
      if (suggestion) {
        actions.push(buildReplaceQuickFix(params.textDocument.uri, diagnostic, suggestion));
      }
      const createSelector = extractCreateSelector(diagnostic);
      if (createSelector) {
        actions.push(buildCreateSelectorQuickFix(diagnostic, createSelector));
      }
      const createModuleFile = extractCreateModuleFile(diagnostic);
      if (createModuleFile) {
        actions.push(buildCreateModuleFileQuickFix(diagnostic, createModuleFile));
      }
    }
    return actions.length > 0 ? actions : null;
  },
  null,
);

function extractSuggestion(diagnostic: Diagnostic): string | null {
  const data = diagnostic.data;
  if (!isRecord(data)) return null;
  const suggestion = data.suggestion;
  return typeof suggestion === "string" && suggestion.length > 0 ? suggestion : null;
}

function extractCreateSelector(diagnostic: Diagnostic): {
  readonly uri: string;
  readonly range: LspRange;
  readonly newText: string;
} | null {
  const data = diagnostic.data;
  if (!isRecord(data)) return null;
  const payload = data.createSelector;
  if (!isRecord(payload)) return null;
  if (typeof payload.uri !== "string" || typeof payload.newText !== "string") return null;
  const range = payload.range;
  if (!isLspRange(range)) return null;
  return { uri: payload.uri, range, newText: payload.newText };
}

function extractCreateModuleFile(diagnostic: Diagnostic): { readonly uri: string } | null {
  const data = diagnostic.data;
  if (!isRecord(data)) return null;
  const payload = data.createModuleFile;
  if (!isRecord(payload)) return null;
  return typeof payload.uri === "string" && payload.uri.length > 0 ? { uri: payload.uri } : null;
}

function isLspRange(value: unknown): value is LspRange {
  if (!isRecord(value)) return false;
  return isPosition(value.start) && isPosition(value.end);
}

function isPosition(value: unknown): value is LspRange["start"] {
  if (!isRecord(value)) return false;
  return typeof value.line === "number" && typeof value.character === "number";
}

function buildReplaceQuickFix(uri: string, diagnostic: Diagnostic, suggestion: string): CodeAction {
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

function buildCreateSelectorQuickFix(
  diagnostic: Diagnostic,
  createSelector: {
    readonly uri: string;
    readonly range: LspRange;
    readonly newText: string;
  },
): CodeAction {
  const match = /Class '\.([^']+)' not found/.exec(diagnostic.message);
  const className = match?.[1] ?? "selector";
  const fileLabel = createSelector.uri.split("/").at(-1) ?? createSelector.uri;
  const edit: WorkspaceEdit = {
    changes: {
      [createSelector.uri]: [
        {
          range: createSelector.range,
          newText: createSelector.newText,
        },
      ],
    },
  };
  return {
    title: `Add '.${className}' to ${fileLabel}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit,
  };
}

function buildCreateModuleFileQuickFix(
  diagnostic: Diagnostic,
  createModuleFile: { readonly uri: string },
): CodeAction {
  const fileLabel = createModuleFile.uri.split("/").at(-1) ?? createModuleFile.uri;
  const createFile: CreateFile = {
    kind: "create",
    uri: createModuleFile.uri,
    options: {
      overwrite: false,
      ignoreIfExists: true,
    },
  };
  const edit: WorkspaceEdit = {
    documentChanges: [createFile],
  };
  return {
    title: `Create ${fileLabel}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit,
    isPreferred: true,
  };
}
