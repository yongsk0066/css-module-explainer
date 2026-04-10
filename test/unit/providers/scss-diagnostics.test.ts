import { describe, expect, it } from "vitest";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver-protocol/node";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { WorkspaceReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import { computeScssUnusedDiagnostics } from "../../../server/src/providers/scss-diagnostics";
import { info, siteAt } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/Button.module.scss";

describe("computeScssUnusedDiagnostics", () => {
  it("flags a selector with zero references as Unnecessary", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///a.tsx", [siteAt("file:///a.tsx", "indicator", 5, SCSS_PATH)]);
    // "active" has no references.
    const diagnostics = computeScssUnusedDiagnostics(SCSS_PATH, classMap, reverseIndex);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("'.active'");
    expect(diagnostics[0]!.severity).toBe(DiagnosticSeverity.Hint);
    expect(diagnostics[0]!.tags).toContain(DiagnosticTag.Unnecessary);
    expect(diagnostics[0]!.source).toBe("css-module-explainer");
  });

  it("returns [] when all selectors have references", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///a.tsx", [
      siteAt("file:///a.tsx", "indicator", 5, SCSS_PATH),
      siteAt("file:///a.tsx", "active", 7, SCSS_PATH),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(SCSS_PATH, classMap, reverseIndex);
    expect(diagnostics).toEqual([]);
  });

  it("suppresses all diagnostics when an unresolvable variable targets the module", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///a.tsx", [
      {
        uri: "file:///a.tsx",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } },
        binding: {
          cxVarName: "cx",
          stylesVarName: "styles",
          scssModulePath: SCSS_PATH,
          classNamesImportName: "classNames",
          scope: { startLine: 0, endLine: 100 },
        },
        match: { kind: "variable", variableName: "someVar" },
      },
    ]);
    const diagnostics = computeScssUnusedDiagnostics(SCSS_PATH, classMap, reverseIndex);
    expect(diagnostics).toEqual([]);
  });

  it("suppresses all diagnostics when a template call targets the module", () => {
    const classMap: ScssClassMap = new Map([
      ["btn-primary", info("btn-primary", 1)],
      ["btn-secondary", info("btn-secondary", 3)],
    ]);
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///a.tsx", [
      {
        uri: "file:///a.tsx",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } },
        binding: {
          cxVarName: "cx",
          stylesVarName: "styles",
          scssModulePath: SCSS_PATH,
          classNamesImportName: "classNames",
          scope: { startLine: 0, endLine: 100 },
        },
        match: { kind: "template", staticPrefix: "btn-" },
      },
    ]);
    const diagnostics = computeScssUnusedDiagnostics(SCSS_PATH, classMap, reverseIndex);
    expect(diagnostics).toEqual([]);
  });

  it("does not flag a class that is composed by another class in the same file", () => {
    const classMap: ScssClassMap = new Map([
      [
        "base",
        {
          name: "base",
          range: { start: { line: 1, character: 1 }, end: { line: 1, character: 5 } },
          fullSelector: ".base",
          declarations: "font-size: 14px",
          ruleRange: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
        },
      ],
      [
        "button",
        {
          name: "button",
          range: { start: { line: 5, character: 1 }, end: { line: 5, character: 7 } },
          fullSelector: ".button",
          declarations: "color: red",
          ruleRange: { start: { line: 5, character: 0 }, end: { line: 8, character: 1 } },
          composes: [{ classNames: ["base"] }],
        },
      ],
    ]);
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///a.tsx", [siteAt("file:///a.tsx", "button", 10, SCSS_PATH)]);
    const diagnostics = computeScssUnusedDiagnostics(SCSS_PATH, classMap, reverseIndex);
    expect(diagnostics).toEqual([]);
  });

  it("returns [] for an empty classMap", () => {
    const classMap: ScssClassMap = new Map();
    const reverseIndex = new WorkspaceReverseIndex();
    const diagnostics = computeScssUnusedDiagnostics(SCSS_PATH, classMap, reverseIndex);
    expect(diagnostics).toEqual([]);
  });

  it("does NOT exempt a class composed via cross-file composes (from './other.module.css')", () => {
    const classMap: ScssClassMap = new Map([
      [
        "base",
        {
          name: "base",
          range: { start: { line: 1, character: 1 }, end: { line: 1, character: 5 } },
          fullSelector: ".base",
          declarations: "font-size: 14px",
          ruleRange: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
        },
      ],
      [
        "button",
        {
          name: "button",
          range: { start: { line: 5, character: 1 }, end: { line: 5, character: 7 } },
          fullSelector: ".button",
          declarations: "color: red",
          ruleRange: { start: { line: 5, character: 0 }, end: { line: 8, character: 1 } },
          composes: [{ classNames: ["base"], from: "./other.module.css" }],
        },
      ],
    ]);
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///a.tsx", [siteAt("file:///a.tsx", "button", 10, SCSS_PATH)]);
    const diagnostics = computeScssUnusedDiagnostics(SCSS_PATH, classMap, reverseIndex);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("'.base'");
  });
});
