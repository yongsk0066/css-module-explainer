import { describe, expect, it, vi } from "vitest";
import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/builders/style-adapter";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { findSelectorAtCursor, handleReferences } from "../../../server/src/providers/references";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";

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
    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///fake/src/App.tsx", [
      semanticSiteAt("file:///fake/src/App.tsx", "indicator", 10, "/fake/src/Button.module.scss"),
    ]);
    const result = handleReferences(
      {
        textDocument: { uri: "file:///fake/src/Button.module.scss" },
        position: { line: 5, character: 3 },
        context: { includeDeclaration: true },
      },
      makeDeps({ semanticReferenceIndex: idx }),
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.uri).toBe("file:///fake/src/App.tsx");
  });

  it("prefers semantic reference sites when available", () => {
    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///fake/src/App.tsx", [
      {
        refId: "class-expr:0",
        selectorId: "selector:/fake/src/Button.module.scss:indicator",
        filePath: "/fake/src/App.tsx",
        uri: "file:///fake/src/App.tsx",
        range: { start: { line: 12, character: 8 }, end: { line: 12, character: 17 } },
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
    const result = handleReferences(
      {
        textDocument: { uri: "file:///fake/src/Button.module.scss" },
        position: { line: 5, character: 3 },
        context: { includeDeclaration: true },
      },
      makeDeps({ semanticReferenceIndex: idx }),
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      uri: "file:///fake/src/App.tsx",
      range: {
        start: { line: 12, character: 8 },
        end: { line: 12, character: 17 },
      },
    });
  });

  // Find-references keeps expanded sites. Rename filters them;
  // Find Refs does not.
  it("find-references STILL surfaces template-expanded sites", () => {
    const SCSS_PATH = "/fake/src/Button.module.scss";
    const SCSS_URI = "file:///fake/src/Button.module.scss";
    const TEMPLATE_URI = "file:///fake/src/App.tsx";
    const TEMPLATE_RANGE = {
      start: { line: 5, character: 14 },
      end: { line: 5, character: 30 },
    };

    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record(TEMPLATE_URI, [
      semanticSiteAt(TEMPLATE_URI, "btn-small", 5, SCSS_PATH, "btn-small", {
        start: TEMPLATE_RANGE.start.character,
        end: TEMPLATE_RANGE.end.character,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
      semanticSiteAt(TEMPLATE_URI, "btn-large", 5, SCSS_PATH, "btn-large", {
        start: TEMPLATE_RANGE.start.character,
        end: TEMPLATE_RANGE.end.character,
        certainty: "inferred",
        reason: "templatePrefix",
      }),
    ]);

    const result = handleReferences(
      {
        textDocument: { uri: SCSS_URI },
        position: { line: 1, character: 3 },
        context: { includeDeclaration: true },
      },
      makeBaseDeps({
        scssClassMapForPath: () =>
          new Map([
            ["btn-small", infoAtLine("btn-small", 1)],
            ["btn-large", infoAtLine("btn-large", 3)],
          ]) as ScssClassMap,
        workspaceRoot: "/fake",
        semanticReferenceIndex: idx,
      }),
    );

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(1);
    const matched = result!.find(
      (loc) =>
        loc.uri === TEMPLATE_URI &&
        loc.range.start.line === TEMPLATE_RANGE.start.line &&
        loc.range.start.character === TEMPLATE_RANGE.start.character,
    );
    expect(matched).toBeDefined();
  });

  // findSelectorAtCursor prefers the BEM-suffix range when present.
  // Cursor on `&--primary` resolves to the nested class entry that
  // the resolved-name fallback range would miss.
  it("findSelectorAtCursor prefers bemSuffix.rawTokenRange over resolved range", () => {
    // Fixture: `.button { &--primary {} }` on two lines.
    // Line 0: `.button {`
    // Line 1: `  &--primary {}`
    // The synthesized resolved `range` points at a fallback column
    // on line 1, but it only covers `button--primary`'s ghost span
    // — the cursor on the `&` column (line 1, char 2) falls INSIDE
    // bemSuffix.rawTokenRange {start:{line:1,char:2}, end:{line:1,char:12}}.
    const info: SelectorInfo = {
      name: "button--primary",
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 17 }, // 15 chars for "button--primary"
      },
      bemSuffix: {
        rawTokenRange: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 12 }, // 10 chars for "&--primary"
        },
        rawToken: "&--primary",
        parentResolvedName: "button",
      },
      isNested: true,
      fullSelector: ".button--primary",
      declarations: "",
      ruleRange: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 15 },
      },
    };
    const classMap = new Map([["button--primary", info]]) as ScssClassMap;
    const styleDocument = buildStyleDocumentFromClassMap("/fake/src/Button.module.scss", classMap);

    // Cursor on the `&` character at (line 1, character 2). The
    // rawTokenRange covers exactly this position; the test locks
    // down that findSelectorAtCursor prefers it.
    const hit = findSelectorAtCursor(styleDocument, 1, 2);
    expect(hit).not.toBeNull();
    expect(hit!.name).toBe("button--primary");

    // Cursor past the rawTokenRange's end (character 11 is the
    // last char `y`; 12 is still INCLUSIVE at the end per the
    // codebase's rangeContains convention). Character 13 is past.
    const miss = findSelectorAtCursor(styleDocument, 1, 13);
    expect(miss).toBeNull();
  });

  it("classnameTransform: finds alias-form TSX access from SCSS cursor on original selector", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    const SCSS_PATH = "/fake/Button.module.scss";
    const SCSS_URI = "file:///fake/Button.module.scss";
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");

    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///fake/App.tsx", [
      semanticSiteAt("file:///fake/App.tsx", "btnPrimary", 5, SCSS_PATH, "btn-primary", {
        reason: "styleAccess",
        origin: "styleAccess",
      }),
    ]);

    // Cursor sits on `.btn-primary` in the SCSS file. Under camelCase
    // mode the class map holds both `btn-primary` (original) and
    // `btnPrimary` (alias) entries. The semantic index stores the
    // alias access under the canonical `btn-primary` selector, so
    // the provider must route through `originalName` to find it.
    const origInfo = classMap.get("btn-primary")!;
    const cursor = {
      line: origInfo.range.start.line,
      character: origInfo.range.start.character,
    };
    const result = handleReferences(
      {
        textDocument: { uri: SCSS_URI },
        position: cursor,
        context: { includeDeclaration: true },
      },
      makeBaseDeps({
        scssClassMapForPath: () => classMap,
        workspaceRoot: "/fake",
        semanticReferenceIndex: idx,
      }),
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.uri).toBe("file:///fake/App.tsx");
  });

  it("classnameTransform (camelCaseOnly): alias-only entry still resolves to the canonical selector bucket", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    const SCSS_PATH = "/fake/Button.module.scss";
    const SCSS_URI = "file:///fake/Button.module.scss";
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCaseOnly");
    // Under `camelCaseOnly` only the alias entry remains in the map;
    // the cursor falls on the alias entry's range but its
    // `originalName` still points at `btn-primary`.
    expect(classMap.has("btn-primary")).toBe(false);
    expect(classMap.has("btnPrimary")).toBe(true);

    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///fake/App.tsx", [
      semanticSiteAt("file:///fake/App.tsx", "btnPrimary", 7, SCSS_PATH, "btn-primary", {
        reason: "styleAccess",
        origin: "styleAccess",
      }),
    ]);

    const aliasInfo = classMap.get("btnPrimary")!;
    const result = handleReferences(
      {
        textDocument: { uri: SCSS_URI },
        position: {
          line: aliasInfo.range.start.line,
          character: aliasInfo.range.start.character,
        },
        context: { includeDeclaration: true },
      },
      makeBaseDeps({
        scssClassMapForPath: () => classMap,
        workspaceRoot: "/fake",
        semanticReferenceIndex: idx,
      }),
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.uri).toBe("file:///fake/App.tsx");
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
