import nodePath from "node:path";
import {
  CodeActionKind,
  type CodeAction,
  type CodeActionParams,
  type CreateFile,
  type Diagnostic,
  type Range as LspRange,
  type WorkspaceEdit,
} from "vscode-languageserver/node";
import {
  getAllStyleExtensions,
  findLangForPath,
} from "../../../engine-core-ts/src/core/scss/lang-registry";
import { fileUrlToPath, pathToFileUrl } from "../../../engine-core-ts/src/core/util/text-utils";
import { isRecord } from "../../../engine-core-ts/src/core/util/value-guards";
import { wrapHandler } from "./_wrap-handler";
import type { ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/codeAction` by emitting recovery actions
 * from diagnostics plus small source-context setup actions.
 */
export const handleCodeAction = wrapHandler<CodeActionParams, [], CodeAction[] | null>(
  "codeAction",
  (params, deps: ProviderDeps) => {
    const actions: CodeAction[] = [];
    const diagnosticCreateModuleUris = new Set<string>();
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
        diagnosticCreateModuleUris.add(createModuleFile.uri);
        actions.push(buildCreateModuleFileQuickFix(diagnostic, createModuleFile));
      }
      const createValue = extractCreateValue(diagnostic);
      if (createValue) {
        actions.push(buildCreateValueQuickFix(diagnostic, createValue));
      }
      const createKeyframes = extractCreateKeyframes(diagnostic);
      if (createKeyframes) {
        actions.push(buildCreateKeyframesQuickFix(diagnostic, createKeyframes));
      }
    }
    if (diagnosticCreateModuleUris.size === 0) {
      for (const siblingUri of listMissingSiblingStyleModuleUris(params.textDocument.uri, deps)) {
        actions.push(buildProactiveCreateModuleFileQuickFix(siblingUri));
      }
    }
    return actions.length > 0 ? actions : null;
  },
  null,
);

function listMissingSiblingStyleModuleUris(uri: string, deps: ProviderDeps): readonly string[] {
  const filePath = fileUrlToPath(uri);
  if (findLangForPath(filePath) !== null) return [];
  if (!isSetupEligibleSourcePath(filePath)) return [];

  const sourceBasePath = filePath.replace(/\.[^.]+$/u, "");
  const siblingPaths = getAllStyleExtensions().map((extension) => `${sourceBasePath}${extension}`);
  if (siblingPaths.some((candidate) => deps.fileExists(candidate))) {
    return [];
  }

  return siblingPaths.map((candidate) => pathToFileUrl(candidate));
}

function isSetupEligibleSourcePath(filePath: string): boolean {
  const extension = nodePath.extname(filePath).toLowerCase();
  return extension === ".tsx" || extension === ".jsx";
}

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

function extractCreateValue(diagnostic: Diagnostic): {
  readonly uri: string;
  readonly range: LspRange;
  readonly newText: string;
} | null {
  const data = diagnostic.data;
  if (!isRecord(data)) return null;
  const payload = data.createValue;
  if (!isRecord(payload)) return null;
  if (typeof payload.uri !== "string" || typeof payload.newText !== "string") return null;
  const range = payload.range;
  if (!isLspRange(range)) return null;
  return { uri: payload.uri, range, newText: payload.newText };
}

function extractCreateKeyframes(diagnostic: Diagnostic): {
  readonly uri: string;
  readonly range: LspRange;
  readonly newText: string;
} | null {
  const data = diagnostic.data;
  if (!isRecord(data)) return null;
  const payload = data.createKeyframes;
  if (!isRecord(payload)) return null;
  if (typeof payload.uri !== "string" || typeof payload.newText !== "string") return null;
  const range = payload.range;
  if (!isLspRange(range)) return null;
  return { uri: payload.uri, range, newText: payload.newText };
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
  const className = extractCreateSelectorClassName(diagnostic.message, createSelector.newText);
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

function extractCreateSelectorClassName(message: string, newText: string): string {
  const fromMessage =
    /Class '\.([^']+)' not found/.exec(message)?.[1] ??
    /Selector '\.([^']+)' not found/.exec(message)?.[1];
  if (fromMessage) return fromMessage;
  return /^\s*\.([^{\s]+)\s*\{/u.exec(newText)?.[1] ?? "selector";
}

function buildCreateModuleFileQuickFix(
  diagnostic: Diagnostic,
  createModuleFile: { readonly uri: string },
): CodeAction {
  return {
    ...buildCreateModuleFileAction(createModuleFile.uri),
    diagnostics: [diagnostic],
    isPreferred: true,
  };
}

function buildCreateValueQuickFix(
  diagnostic: Diagnostic,
  createValue: {
    readonly uri: string;
    readonly range: LspRange;
    readonly newText: string;
  },
): CodeAction {
  const valueName = extractCreateValueName(diagnostic.message, createValue.newText);
  const fileLabel = createValue.uri.split("/").at(-1) ?? createValue.uri;
  const edit: WorkspaceEdit = {
    changes: {
      [createValue.uri]: [
        {
          range: createValue.range,
          newText: createValue.newText,
        },
      ],
    },
  };
  return {
    title: `Add '@value ${valueName}' to ${fileLabel}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit,
  };
}

function buildProactiveCreateModuleFileQuickFix(uri: string): CodeAction {
  return buildCreateModuleFileAction(uri);
}

function buildCreateKeyframesQuickFix(
  diagnostic: Diagnostic,
  createKeyframes: {
    readonly uri: string;
    readonly range: LspRange;
    readonly newText: string;
  },
): CodeAction {
  const keyframesName = extractCreateKeyframesName(diagnostic.message, createKeyframes.newText);
  const fileLabel = createKeyframes.uri.split("/").at(-1) ?? createKeyframes.uri;
  const edit: WorkspaceEdit = {
    changes: {
      [createKeyframes.uri]: [
        {
          range: createKeyframes.range,
          newText: createKeyframes.newText,
        },
      ],
    },
  };
  return {
    title: `Add '@keyframes ${keyframesName}' to ${fileLabel}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit,
  };
}

function buildCreateModuleFileAction(uri: string): CodeAction {
  const fileLabel = uri.split("/").at(-1) ?? uri;
  const createFile: CreateFile = {
    kind: "create",
    uri,
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
    edit,
  };
}

function extractCreateValueName(message: string, newText: string): string {
  const fromMessage =
    /@value '([^']+)' not found/.exec(message)?.[1] ?? /local binding '([^']+)'/.exec(message)?.[1];
  if (fromMessage) return fromMessage;
  return /^\s*@value\s+([^:\s]+)\s*:/u.exec(newText)?.[1] ?? "value";
}

function extractCreateKeyframesName(message: string, newText: string): string {
  const fromMessage = /@keyframes '([^']+)' not found/.exec(message)?.[1];
  if (fromMessage) return fromMessage;
  return /^\s*@keyframes\s+([^{\s]+)\s*\{/u.exec(newText)?.[1] ?? "keyframes";
}
