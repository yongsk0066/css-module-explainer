import { describe, expect, it, vi } from "vitest";
import {
  CodeActionKind,
  DiagnosticSeverity,
  type CodeActionParams,
  type Diagnostic,
} from "vscode-languageserver-protocol/node";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleCodeAction } from "../../../server/src/providers/code-actions";
import { makeBaseDeps } from "../../_fixtures/test-helpers";

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return makeBaseDeps({
    selectorMapForPath: () => new Map(),
    workspaceRoot: "/fake",
    ...overrides,
  });
}

function diagnostic(suggestion: string | undefined, message = "foo"): Diagnostic {
  const className = /Class '\.([^']+)'/.exec(message)?.[1] ?? "generated";
  return {
    range: {
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    },
    severity: DiagnosticSeverity.Warning,
    source: "css-module-explainer",
    message,
    data:
      suggestion === undefined
        ? undefined
        : {
            suggestion,
            createSelector: {
              uri: "file:///fake/src/Button.module.scss",
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 0 },
              },
              newText: `\n\n.${className} {\n}\n`,
            },
          },
  };
}

function makeParams(diagnostics: Diagnostic[]): CodeActionParams {
  return {
    textDocument: { uri: "file:///fake/src/Button.tsx" },
    range: diagnostics[0]?.range ?? {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    context: { diagnostics, triggerKind: 1 },
  };
}

describe("handleCodeAction", () => {
  it("returns replace and create actions for a diagnostic with a suggestion", () => {
    const d = diagnostic("indicator", "Class '.indicaror' not found. Did you mean 'indicator'?");
    const result = handleCodeAction(makeParams([d]), makeDeps());
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const action = result![0]!;
    expect(action.title).toBe("Replace with 'indicator'");
    expect(action.kind).toBe(CodeActionKind.QuickFix);
    expect(action.isPreferred).toBe(true);
    expect(action.diagnostics).toEqual([d]);
    const edits = action.edit?.changes?.["file:///fake/src/Button.tsx"];
    expect(edits).toHaveLength(1);
    expect(edits![0]!.newText).toBe("indicator");
    expect(edits![0]!.range).toEqual(d.range);

    const createAction = result![1]!;
    expect(createAction.title).toBe("Add '.indicaror' to Button.module.scss");
    const createEdits = createAction.edit?.changes?.["file:///fake/src/Button.module.scss"];
    expect(createEdits).toHaveLength(1);
    expect(createEdits![0]!.newText).toBe("\n\n.indicaror {\n}\n");
  });

  it("returns null when no diagnostic carries a suggestion", () => {
    const result = handleCodeAction(
      makeParams([
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 4 },
          },
          severity: DiagnosticSeverity.Warning,
          source: "css-module-explainer",
          message: "whatever",
        },
      ]),
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("skips diagnostics with non-string or empty suggestion payloads", () => {
    const withBadShape: Diagnostic = {
      ...diagnostic("keep"),
      data: { suggestion: 123 }, // wrong type
    };
    const empty = { ...diagnostic(""), data: { suggestion: "" } };
    const good = diagnostic("real-one");
    const result = handleCodeAction(makeParams([withBadShape, empty, good]), makeDeps());
    expect(result).toHaveLength(2);
    expect(result![0]!.title).toBe("Replace with 'real-one'");
  });

  it("returns a create-selector quick fix even when there is no typo suggestion", () => {
    const d: Diagnostic = {
      range: {
        start: { line: 4, character: 15 },
        end: { line: 4, character: 24 },
      },
      severity: DiagnosticSeverity.Warning,
      source: "css-module-explainer",
      message: "Class '.missing' not found in Button.module.scss.",
      data: {
        createSelector: {
          uri: "file:///fake/src/Button.module.scss",
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 0 },
          },
          newText: "\n\n.missing {\n}\n",
        },
      },
    };
    const result = handleCodeAction(makeParams([d]), makeDeps());
    expect(result).toHaveLength(1);
    expect(result![0]!.title).toBe("Add '.missing' to Button.module.scss");
  });

  it("returns a create-module quick fix for a missing-module diagnostic", () => {
    const d: Diagnostic = {
      range: {
        start: { line: 0, character: 19 },
        end: { line: 0, character: 38 },
      },
      severity: DiagnosticSeverity.Warning,
      source: "css-module-explainer",
      message: "Cannot resolve CSS Module './Button.module.scss'. The file does not exist.",
      code: "missing-module",
      data: {
        createModuleFile: {
          uri: "file:///fake/src/Button.module.scss",
        },
      },
    };
    const result = handleCodeAction(makeParams([d]), makeDeps());
    expect(result).toHaveLength(1);
    expect(result![0]!.title).toBe("Create Button.module.scss");
    expect(result![0]!.kind).toBe(CodeActionKind.QuickFix);
    expect(result![0]!.isPreferred).toBe(true);
    expect(result![0]!.edit?.documentChanges).toEqual([
      {
        kind: "create",
        uri: "file:///fake/src/Button.module.scss",
        options: { overwrite: false, ignoreIfExists: true },
      },
    ]);
  });

  it("returns sibling module creation actions for a TSX file without an existing sibling module", () => {
    const result = handleCodeAction(makeParams([]), makeDeps({ fileExists: () => false }));
    expect(result).toHaveLength(3);
    expect(result?.map((action) => action.title)).toEqual([
      "Create Button.module.scss",
      "Create Button.module.css",
      "Create Button.module.less",
    ]);
    expect(result?.every((action) => action.kind === CodeActionKind.QuickFix)).toBe(true);
    expect(result?.[0]?.edit?.documentChanges).toEqual([
      {
        kind: "create",
        uri: "file:///fake/src/Button.module.scss",
        options: { overwrite: false, ignoreIfExists: true },
      },
    ]);
  });

  it("does not return sibling module creation actions when a sibling module already exists", () => {
    const result = handleCodeAction(
      makeParams([]),
      makeDeps({
        fileExists: (path) => path.endsWith("Button.module.scss"),
      }),
    );
    expect(result).toBeNull();
  });

  it("logs and returns null on exception", () => {
    const logError = vi.fn();
    // Poison the diagnostics iterable so for-of throws.
    const poisonedParams = {
      textDocument: { uri: "file:///fake/src/Button.tsx" },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: {
        diagnostics: new Proxy([diagnostic("x")], {
          get(target, prop) {
            if (prop === Symbol.iterator) throw new Error("boom");
            return Reflect.get(target, prop);
          },
        }) as Diagnostic[],
        triggerKind: 1,
      },
    } satisfies CodeActionParams;
    const result = handleCodeAction(poisonedParams, makeDeps({ logError }));
    expect(result).toBeNull();
    expect(logError).toHaveBeenCalledWith("codeAction handler failed", expect.any(Error));
  });
});
