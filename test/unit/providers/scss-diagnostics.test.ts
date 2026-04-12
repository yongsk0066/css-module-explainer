import { describe, expect, it } from "vitest";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver-protocol/node";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/compat/style-document-builder-compat";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import { computeScssUnusedDiagnostics } from "../../../server/src/providers/scss-diagnostics";
import { infoAtLine as info, semanticSiteAt } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/Button.module.scss";

function styleDocument(classMap: ScssClassMap) {
  return buildStyleDocumentFromClassMap(SCSS_PATH, classMap);
}

describe("computeScssUnusedDiagnostics", () => {
  it("flags a selector with zero references as Unnecessary", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 5, SCSS_PATH),
    ]);
    // "active" has no references.
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
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
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 5, SCSS_PATH),
      semanticSiteAt("file:///a.tsx", "active", 7, SCSS_PATH),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toEqual([]);
  });

  it("suppresses all diagnostics when an unresolvable variable targets the module", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record(
      "file:///a.tsx",
      [],
      [
        {
          refId: "ref:variable",
          uri: "file:///a.tsx",
          filePath: "/a.tsx",
          range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          expressionKind: "symbolRef",
          hasResolvedTargets: false,
          isDynamic: true,
        },
      ],
    );
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toEqual([]);
  });

  it("suppresses all diagnostics when a template call targets the module", () => {
    const classMap: ScssClassMap = new Map([
      ["btn-primary", info("btn-primary", 1)],
      ["btn-secondary", info("btn-secondary", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record(
      "file:///a.tsx",
      [],
      [
        {
          refId: "ref:template",
          uri: "file:///a.tsx",
          filePath: "/a.tsx",
          range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          expressionKind: "template",
          hasResolvedTargets: false,
          isDynamic: true,
        },
      ],
    );
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toEqual([]);
  });

  it("does not suppress diagnostics when dynamic refs were resolved", () => {
    const classMap: ScssClassMap = new Map([
      ["btn-primary", info("btn-primary", 1)],
      ["btn-secondary", info("btn-secondary", 3)],
      ["btn-tertiary", info("btn-tertiary", 5)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record(
      "file:///a.tsx",
      [
        {
          refId: "ref:branch",
          selectorId: "selector:btn-primary",
          filePath: "/a.tsx",
          uri: "file:///a.tsx",
          range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          selectorFilePath: SCSS_PATH,
          canonicalName: "btn-primary",
          className: "btn-primary",
          certainty: "inferred",
          reason: "flowBranch",
          expansion: "expanded",
        },
      ],
      [
        {
          refId: "ref:branch",
          uri: "file:///a.tsx",
          filePath: "/a.tsx",
          range: { start: { line: 5, character: 10 }, end: { line: 5, character: 14 } },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          expressionKind: "symbolRef",
          hasResolvedTargets: true,
          isDynamic: true,
        },
      ],
    );
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("btn-secondary"))).toBe(
      true,
    );
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("btn-tertiary"))).toBe(
      true,
    );
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
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "button", 10, SCSS_PATH),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toEqual([]);
  });

  it("returns [] for an empty classMap", () => {
    const classMap: ScssClassMap = new Map();
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      new WorkspaceSemanticWorkspaceReferenceIndex(),
    );
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
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "button", 10, SCSS_PATH),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("'.base'");
  });

  it("classnameTransform: does not double-count unused alias entries", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    // `.btn-primary` is used via its original name; `.orphan` is unused.
    const base = parseStyleModule(
      `.btn-primary { color: red; }\n.orphan { color: blue; }`,
      SCSS_PATH,
    );
    const classMap = expandClassMapWithTransform(base, "camelCase");
    // Sanity: alias exists for btn-primary; `.orphan` is already a
    // valid JS identifier so the transform yields no distinct alias.
    expect(classMap.has("btn-primary")).toBe(true);
    expect(classMap.has("btnPrimary")).toBe(true);

    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "btn-primary", 10, SCSS_PATH),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    // Exactly one warning — for `.orphan` — not a second copy for
    // any alias entry.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("'.orphan'");
  });

  it("classnameTransform: original-is-unused still emits exactly one warning", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    // Consumer references only via the CAMEL alias — the original
    // `btn-primary` has zero direct refs, but we still want exactly
    // one warning, not zero (via alias double-count) and not two.
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      new WorkspaceSemanticWorkspaceReferenceIndex(),
    );
    expect(diagnostics.filter((d) => d.message.includes("btn-primary"))).toHaveLength(1);
  });

  it("classnameTransform: alias-form TSX access keeps the original marked as used", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    // `.btn-primary` is accessed ONLY via the camelCase alias from
    // a TSX file (`styles.btnPrimary`) — no canonical `cx('btn-primary')`
    // call exists. The reverse index canonicalises the alias access
    // under `btn-primary`, so the unused-selector check must find the
    // reference and skip the warning.
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");

    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "btnPrimary", 5, SCSS_PATH, "btn-primary", {
        reason: "styleAccess",
        origin: "styleAccess",
      }),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toHaveLength(0);
  });

  it("classnameTransform (camelCaseOnly): alias-only class still gets unused detection", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    // `camelCaseOnly` drops the original from the class map entirely;
    // only `btnPrimary` remains with `originalName: "btn-primary"`.
    // The unused check must still emit exactly one warning for the
    // canonical `btn-primary` even though no entry keyed on that
    // name exists in the map.
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCaseOnly");
    expect(classMap.has("btn-primary")).toBe(false);
    expect(classMap.has("btnPrimary")).toBe(true);

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      new WorkspaceSemanticWorkspaceReferenceIndex(),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("'.btn-primary'");
  });

  it("semantic direct alias access keeps the canonical selector marked as used", async () => {
    const { parseStyleModule } = await import("../../../server/src/core/scss/scss-parser");
    const { expandClassMapWithTransform } =
      await import("../../../server/src/core/scss/classname-transform");
    const base = parseStyleModule(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandClassMapWithTransform(base, "camelCase");

    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      {
        refId: "ref:file:///a.tsx:5:10",
        selectorId: `selector:${SCSS_PATH}:btn-primary`,
        filePath: "/a.tsx",
        uri: "file:///a.tsx",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 20 } },
        origin: "styleAccess",
        scssModulePath: SCSS_PATH,
        selectorFilePath: SCSS_PATH,
        canonicalName: "btn-primary",
        className: "btnPrimary",
        certainty: "exact",
        reason: "styleAccess",
        expansion: "direct",
      },
    ]);

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toEqual([]);
  });

  it("semantic inferred matches suppress unused diagnostics for resolved dynamic refs", () => {
    const classMap: ScssClassMap = new Map([
      ["btn-primary", info("btn-primary", 1)],
      ["btn-secondary", info("btn-secondary", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      {
        refId: "ref:file:///a.tsx:5:10",
        selectorId: `selector:${SCSS_PATH}:btn-primary`,
        filePath: "/a.tsx",
        uri: "file:///a.tsx",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 30 } },
        origin: "cxCall",
        scssModulePath: SCSS_PATH,
        selectorFilePath: SCSS_PATH,
        canonicalName: "btn-primary",
        className: "btn-primary",
        certainty: "inferred",
        reason: "templatePrefix",
        expansion: "expanded",
      },
    ]);

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("'.btn-secondary'");
  });
});
