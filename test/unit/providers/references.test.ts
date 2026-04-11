import { describe, expect, it, vi } from "vitest";
import type { CallSite, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { WorkspaceReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { findSelectorAtCursor, handleReferences } from "../../../server/src/providers/references";
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
        scssModulePath: "/fake/src/Button.module.scss",
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

  // ──────────────────────────────────────────────────────────────
  // Wave 1 Stage 3.1 regression guard — find-references keeps
  // expanded template/variable sites. Rename filters them; Find
  // Refs does not. This test prevents future "simplification"
  // from dropping expanded entries at collectCallSites.
  // ──────────────────────────────────────────────────────────────
  it("find-references STILL surfaces template-expanded sites (wave1-stage3.1)", () => {
    const SCSS_PATH = "/fake/src/Button.module.scss";
    const SCSS_URI = "file:///fake/src/Button.module.scss";
    const TEMPLATE_URI = "file:///fake/src/App.tsx";
    const TEMPLATE_RANGE = {
      start: { line: 5, character: 14 },
      end: { line: 5, character: 30 },
    };

    const idx = new WorkspaceReverseIndex();
    const base = { uri: TEMPLATE_URI, range: TEMPLATE_RANGE, scssModulePath: SCSS_PATH };
    const sites: CallSite[] = [
      { ...base, match: { kind: "template", staticPrefix: "btn-" }, expansion: "direct" },
      { ...base, match: { kind: "static", className: "btn-small" }, expansion: "expanded" },
      { ...base, match: { kind: "static", className: "btn-large" }, expansion: "expanded" },
    ];
    idx.record(TEMPLATE_URI, sites);

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
        reverseIndex: idx,
      }),
    );

    // The expanded site must still surface in Find References.
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

  // ──────────────────────────────────────────────────────────────
  // findSelectorAtCursor prefers rawTokenRange when present — lets
  // cursor on `&--primary` resolve to the nested class entry that
  // the resolved-name fallback range would miss.
  // ──────────────────────────────────────────────────────────────
  it("findSelectorAtCursor prefers rawTokenRange over resolved range", () => {
    // Fixture: `.button { &--primary {} }` on two lines.
    // Line 0: `.button {`
    // Line 1: `  &--primary {}`
    // The synthesized resolved `range` points at a fallback column
    // on line 1, but it only covers `button--primary`'s ghost span
    // — the cursor on the `&` column (line 1, char 2) falls INSIDE
    // `rawTokenRange` {start:{line:1,char:2}, end:{line:1,char:12}}.
    const info: SelectorInfo = {
      name: "button--primary",
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 17 }, // 15 chars for "button--primary"
      },
      rawTokenRange: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 12 }, // 10 chars for "&--primary"
      },
      rawToken: "&--primary",
      parentResolvedName: "button",
      isNested: true,
      fullSelector: ".button--primary",
      declarations: "",
      ruleRange: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 15 },
      },
    };
    const classMap = new Map([["button--primary", info]]) as ScssClassMap;

    // Cursor on the `&` character at (line 1, character 2). The
    // rawTokenRange covers exactly this position; the test locks
    // down that findSelectorAtCursor prefers it.
    const hit = findSelectorAtCursor(classMap, 1, 2);
    expect(hit).not.toBeNull();
    expect(hit!.name).toBe("button--primary");

    // Cursor past the rawTokenRange's end (character 11 is the
    // last char `y`; 12 is still INCLUSIVE at the end per the
    // codebase's rangeContains convention). Character 13 is past.
    const miss = findSelectorAtCursor(classMap, 1, 13);
    expect(miss).toBeNull();
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
