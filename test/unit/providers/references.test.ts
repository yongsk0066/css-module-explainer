import { describe, expect, it, vi } from "vitest";
import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";
import {
  NullReverseIndex,
  WorkspaceReverseIndex,
} from "../../../server/src/core/indexing/reverse-index.js";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver.js";
import { NOOP_LOG_ERROR, type ProviderDeps } from "../../../server/src/providers/provider-utils.js";
import { handleReferences } from "../../../server/src/providers/references.js";

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
    scssClassMapForPath: () => new Map([["indicator", info("indicator", 5)]]) as ScssClassMap,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake",
    logError: NOOP_LOG_ERROR,
    ...overrides,
  };
}

describe("handleReferences", () => {
  it("returns null for non-style files", () => {
    const result = handleReferences(
      {
        textDocument: { uri: "file:///fake/src/Button.tsx" },
        position: { line: 0, character: 0 },
        context: { includeDeclaration: true },
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when cursor is not on a class selector", () => {
    const result = handleReferences(
      {
        textDocument: { uri: "file:///fake/src/Button.module.scss" },
        position: { line: 99, character: 0 },
        context: { includeDeclaration: true },
      },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns Location[] when references exist", () => {
    const idx = new WorkspaceReverseIndex();
    idx.record("file:///fake/src/App.tsx", [
      {
        uri: "file:///fake/src/App.tsx",
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
    const result = handleReferences(
      {
        textDocument: { uri: "file:///fake/src/Button.module.scss" },
        position: { line: 5, character: 3 },
        context: { includeDeclaration: true },
      },
      makeDeps({ reverseIndex: idx }),
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.uri).toBe("file:///fake/src/App.tsx");
  });

  it("logs and returns null on exception", () => {
    const logError = vi.fn();
    const result = handleReferences(
      {
        textDocument: { uri: "file:///fake/src/Button.module.scss" },
        position: { line: 5, character: 3 },
        context: { includeDeclaration: true },
      },
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
