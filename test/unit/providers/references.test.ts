import { describe, expect, it, vi } from "vitest";
import type { CallSite, ScssClassMap } from "@css-module-explainer/shared";
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
