import { describe, expect, it, vi } from "vitest";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { WorkspaceReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleCodeLens } from "../../../server/src/providers/reference-lens";
import { infoAtLine, makeBaseDeps, siteAt } from "../../_fixtures/test-helpers";

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
        scssModulePath: "/fake/src/Button.module.scss",
        match: { kind: "static", className: "indicator", canonicalName: "indicator" },
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

  it("uses semantic reference counts when available", () => {
    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///a.tsx", [
      {
        refId: "class-expr:0",
        selectorId: "selector:/fake/src/Button.module.scss:indicator",
        filePath: "/fake/src/App.tsx",
        uri: "file:///fake/src/App.tsx",
        range: { start: { line: 10, character: 5 }, end: { line: 10, character: 14 } },
        origin: "cxCall",
        scssModulePath: "/fake/src/Button.module.scss",
        selectorFilePath: "/fake/src/Button.module.scss",
        canonicalName: "indicator",
        className: "indicator",
        certainty: "exact",
        reason: "literal",
        expansion: "direct",
      },
    ]);
    const result = handleCodeLens(
      { textDocument: { uri: "file:///fake/src/Button.module.scss" } },
      makeDeps({ semanticReferenceIndex: idx }),
    );

    expect(result).not.toBeNull();
    const indicatorLens = result!.find((lens) => lens.command?.title === "1 reference");
    expect(indicatorLens).toBeDefined();
  });

  it("classnameTransform (camelCaseOnly): emits a lens for an alias-only entry whose bucket lives under canonical", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    const SCSS_PATH = "/fake/src/Button.module.scss";
    const SCSS_URI = "file:///fake/src/Button.module.scss";
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCaseOnly");
    // Under camelCaseOnly the original key is gone; only the alias
    // entry remains, keyed by `btnPrimary` with `originalName`
    // pointing at `btn-primary`.
    expect(classMap.has("btn-primary")).toBe(false);
    expect(classMap.has("btnPrimary")).toBe(true);

    const idx = new WorkspaceReverseIndex();
    idx.record("file:///fake/src/App.tsx", [
      siteAt("file:///fake/src/App.tsx", "btnPrimary", 5, SCSS_PATH, "btn-primary"),
    ]);

    const result = handleCodeLens(
      { textDocument: { uri: SCSS_URI } },
      makeBaseDeps({
        scssClassMapForPath: () => classMap,
        workspaceRoot: "/fake",
        reverseIndex: idx,
      }),
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.command?.title).toBe("1 reference");
  });

  it("classnameTransform: emits one lens reflecting the canonical bucket across both class-map views", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    const SCSS_PATH = "/fake/src/Button.module.scss";
    const SCSS_URI = "file:///fake/src/Button.module.scss";
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");
    // Under camelCase the map holds both views of the same class.
    expect(classMap.has("btn-primary")).toBe(true);
    expect(classMap.has("btnPrimary")).toBe(true);

    // Two real references — one via the original-form token, one
    // via the alias-form — so the canonical bucket holds a
    // distinguishable count.
    const idx = new WorkspaceReverseIndex();
    idx.record("file:///fake/src/App.tsx", [
      siteAt("file:///fake/src/App.tsx", "btn-primary", 5, SCSS_PATH, "btn-primary"),
      siteAt("file:///fake/src/App.tsx", "btnPrimary", 9, SCSS_PATH, "btn-primary"),
    ]);

    const result = handleCodeLens(
      { textDocument: { uri: SCSS_URI } },
      makeBaseDeps({
        scssClassMapForPath: () => classMap,
        workspaceRoot: "/fake",
        reverseIndex: idx,
      }),
    );

    expect(result).not.toBeNull();
    // Exactly one lens — locks out a future edit that routes every
    // class-map view through the canonical bucket but forgets to
    // dedup, producing two lenses with the same count.
    expect(result).toHaveLength(1);
    // Count reflects the canonical bucket holding BOTH sites. An
    // alias-keyed lookup would have produced `"0 references"` and
    // returned `null` on the alias entry, or `"1 reference"` off
    // the single original-form site.
    expect(result![0]!.command?.title).toBe("2 references");
    // No stray zero-count lens in the result set — rules out the
    // "canonical routing forgot dedup" regression path where both
    // entries emit, one with the real count and one with an
    // empty-bucket miss.
    expect(result!.some((l) => l.command?.title === "0 references")).toBe(false);
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
