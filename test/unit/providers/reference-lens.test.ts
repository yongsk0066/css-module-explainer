import { describe, expect, it, vi } from "vitest";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { WorkspaceReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleCodeLens } from "../../../server/src/providers/reference-lens";
import { infoAtLine, makeBaseDeps } from "../../_fixtures/test-helpers";

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return makeBaseDeps({
    scssClassMapForPath: () =>
      new Map([
        ["indicator", infoAtLine("indicator", 5)],
        ["active", infoAtLine("active", 10)],
      ]) as ScssClassMap,
    workspaceRoot: "/fake",
    ...overrides,
  });
}

describe("handleCodeLens", () => {
  it("returns null for non-style files", () => {
    const result = handleCodeLens(
      { textDocument: { uri: "file:///fake/src/Button.tsx" } },
      makeDeps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when no class has references", () => {
    const result = handleCodeLens(
      { textDocument: { uri: "file:///fake/src/Button.module.scss" } },
      makeDeps(),
    );
    expect(result).toBeNull();
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
