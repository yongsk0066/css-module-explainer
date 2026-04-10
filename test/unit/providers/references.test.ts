import { describe, expect, it, vi } from "vitest";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { WorkspaceReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleReferences } from "../../../server/src/providers/references";
import { infoAtLine, makeBaseDeps } from "../../_fixtures/test-helpers";

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return makeBaseDeps({
    scssClassMapForPath: () => new Map([["indicator", infoAtLine("indicator", 5)]]) as ScssClassMap,
    workspaceRoot: "/fake",
    ...overrides,
  });
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
