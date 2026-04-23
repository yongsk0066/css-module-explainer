import {
  CodeActionKind,
  type CodeAction,
  type CodeActionParams,
  type CreateFile,
  type WorkspaceEdit,
} from "vscode-languageserver/node";
import {
  planCodeActions,
  type CodeActionPlan,
} from "../../../engine-host-node/src/code-action-query";
import { wrapHandler } from "./_wrap-handler";
import type { ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/codeAction` by mapping host-side recovery plans
 * into LSP quick fixes.
 */
export const handleCodeAction = wrapHandler<CodeActionParams, [], CodeAction[] | null>(
  "codeAction",
  (params, deps: ProviderDeps) => {
    const plans = planCodeActions(
      {
        documentUri: params.textDocument.uri,
        diagnostics: params.context.diagnostics,
      },
      deps,
    );
    if (plans.length === 0) return null;
    return plans.map((plan) => toCodeAction(plan, params.context.diagnostics));
  },
  null,
);

function toCodeAction(
  plan: CodeActionPlan,
  diagnostics: CodeActionParams["context"]["diagnostics"],
): CodeAction {
  return {
    title: plan.title,
    kind: CodeActionKind.QuickFix,
    ...(plan.diagnosticIndex !== undefined
      ? { diagnostics: [diagnostics[plan.diagnosticIndex]!] }
      : {}),
    ...(plan.isPreferred ? { isPreferred: true } : {}),
    edit: toWorkspaceEdit(plan),
  };
}

function toWorkspaceEdit(plan: CodeActionPlan): WorkspaceEdit {
  if (plan.kind === "createFile") {
    const createFile: CreateFile = {
      kind: "create",
      uri: plan.uri,
      options: {
        overwrite: false,
        ignoreIfExists: true,
      },
    };
    return { documentChanges: [createFile] };
  }

  return {
    changes: {
      [plan.uri]: [
        {
          range: plan.range,
          newText: plan.newText,
        },
      ],
    },
  };
}
