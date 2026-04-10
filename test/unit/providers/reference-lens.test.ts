import { describe, expect, it, vi } from "vitest";
import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import {
  NullReverseIndex,
  WorkspaceReverseIndex,
} from "../../../server/src/core/indexing/reverse-index";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleCodeLens } from "../../../server/src/providers/reference-lens";

function info(name: string, line: number): SelectorInfo {
  return {
    name,
    range: { start: { line, character: 1 }, end: { line, character: 1 + name.length } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line, character: 0 }, end: { line: line + 2, character: 1 } },
  };
}

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return {
    analysisCache: new DocumentAnalysisCache({
      sourceFileCache: new SourceFileCache({ max: 10 }),
      detectCxBindings: () => [],
      parseCxCalls: () => [],
      max: 10,
    }),
    scssClassMapFor: () => null,
    scssClassMapForPath: () =>
      new Map([
        ["indicator", info("indicator", 5)],
        ["active", info("active", 10)],
      ]) as ScssClassMap,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake",
    logError: NOOP_LOG_ERROR,
    ...overrides,
  };
}

describe("handleCodeLens", () => {
  it("returns null for non-style files", () => {
    const result = handleCodeLens(
      { textDocument: { uri: "file:///fake/src/Button.tsx" } },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns one CodeLens per class in the classMap", () => {
    const result = handleCodeLens(
      { textDocument: { uri: "file:///fake/src/Button.module.scss" } },
      makeDeps(),
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]!.command?.title).toBe("no references");
  });

  it("shows reference count when sites exist", () => {
    const idx = new WorkspaceReverseIndex();
    idx.record("file:///a.tsx", [
      {
        uri: "file:///a.tsx",
        range: { start: { line: 10, character: 5 }, end: { line: 10, character: 14 } },
        binding: {
          cxVarName: "cx",
          stylesVarName: "s",
          scssModulePath: "/fake/src/Button.module.scss",
          classNamesImportName: "classNames",
          scope: { startLine: 0, endLine: 100 },
        },
        match: { kind: "static", className: "indicator" },
      },
    ]);
    const result = handleCodeLens(
      { textDocument: { uri: "file:///fake/src/Button.module.scss" } },
      makeDeps({ reverseIndex: idx }),
    );
    expect(result).not.toBeNull();
    const indicatorLens = result!.find((l) => l.command?.title.includes("1 reference"));
    expect(indicatorLens).toBeDefined();
  });

  it("logs and returns null on exception", () => {
    const logError = vi.fn();
    const result = handleCodeLens(
      { textDocument: { uri: "file:///fake/src/Button.module.scss" } },
      makeDeps({
        scssClassMapForPath: () => {
          throw new Error("boom");
        },
        logError,
      }),
    );
    expect(result).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
