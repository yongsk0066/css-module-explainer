import { describe, expect, it, vi } from "vitest";
import {
  CodeActionKind,
  DiagnosticSeverity,
  type CodeActionParams,
  type Diagnostic,
} from "vscode-languageserver-protocol/node";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleCodeAction } from "../../../server/src/providers/code-actions";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  return {
    analysisCache: new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      detectCxBindings: () => [],
      parseCxCalls: () => [],
      max: 10,
    }),
    scssClassMapFor: () => new Map() as ScssClassMap,
    scssClassMapForPath: () => null,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake",
    logError: NOOP_LOG_ERROR,
    ...overrides,
  };
}

function diagnostic(suggestion: string | undefined, message = "foo"): Diagnostic {
  return {
    range: {
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    },
    severity: DiagnosticSeverity.Warning,
    source: "css-module-explainer",
    message,
    data: suggestion === undefined ? undefined : { suggestion },
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
  it("returns one QuickFix CodeAction per diagnostic with a suggestion", () => {
    const d = diagnostic("indicator", "Class '.indicaror' not found. Did you mean 'indicator'?");
    const result = handleCodeAction(makeParams([d]), makeDeps());
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    const action = result![0]!;
    expect(action.title).toBe("Replace with 'indicator'");
    expect(action.kind).toBe(CodeActionKind.QuickFix);
    expect(action.isPreferred).toBe(true);
    expect(action.diagnostics).toEqual([d]);
    const edits = action.edit?.changes?.["file:///fake/src/Button.tsx"];
    expect(edits).toHaveLength(1);
    expect(edits![0]!.newText).toBe("indicator");
    expect(edits![0]!.range).toEqual(d.range);
  });

  it("returns null when no diagnostic carries a suggestion", () => {
    const result = handleCodeAction(makeParams([diagnostic(undefined)]), makeDeps());
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
    expect(result).toHaveLength(1);
    expect(result![0]!.title).toBe("Replace with 'real-one'");
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
    expect(logError).toHaveBeenCalledWith("code-action handler failed", expect.any(Error));
  });
});
