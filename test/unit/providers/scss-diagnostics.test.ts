import { describe, expect, it } from "vitest";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver-protocol/node";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { WorkspaceStyleDependencyGraph } from "../../../server/engine-core-ts/src/core/semantic/style-dependency-graph";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { computeScssUnusedDiagnostics } from "../../../server/lsp-server/src/providers/scss-diagnostics";
import { infoAtLine as info, semanticSiteAt } from "../../_fixtures/test-helpers";
import {
  buildStyleDocumentFromSelectorMap,
  expandSelectorMapWithTransform,
  makeTestSelector,
  parseStyleSelectorMap,
} from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/Button.module.scss";

function styleDocument(selectors: ReadonlyMap<string, ReturnType<typeof info>>) {
  return buildStyleDocumentFromSelectorMap(SCSS_PATH, selectors);
}

describe("computeScssUnusedDiagnostics", () => {
  it("flags a selector with zero references as Unnecessary", () => {
    const classMap = new Map([
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
    const classMap = new Map([
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
    const classMap = new Map([
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
    const classMap = new Map([
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
    const classMap = new Map([
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
    const classMap = new Map([
      ["base", info("base", 1, "font-size: 14px")],
      ["button", { ...info("button", 5, "color: red"), composes: [{ classNames: ["base"] }] }],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDependencyGraph = new WorkspaceStyleDependencyGraph();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "button", 10, SCSS_PATH),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
      styleDependencyGraph,
    );
    expect(diagnostics).toEqual([]);
  });

  it("does not exempt a same-file composed class when the composing selector is also unused", () => {
    const classMap = new Map([
      ["base", info("base", 1, "font-size: 14px")],
      ["button", { ...info("button", 5, "color: red"), composes: [{ classNames: ["base"] }] }],
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      new WorkspaceSemanticWorkspaceReferenceIndex(),
      new WorkspaceStyleDependencyGraph(),
    );
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("'.base'"))).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("'.button'"))).toBe(true);
  });

  it("returns [] for an empty classMap", () => {
    const classMap = new Map();
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      new WorkspaceSemanticWorkspaceReferenceIndex(),
    );
    expect(diagnostics).toEqual([]);
  });

  it("does exempt a class composed via cross-file composes when the composing selector is used", () => {
    const classMap = new Map([["base", info("base", 1, "font-size: 14px")]]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDependencyGraph = new WorkspaceStyleDependencyGraph();
    styleDependencyGraph.record(
      "/fake/other.module.css",
      buildStyleDocumentFromSelectorMap(
        "/fake/other.module.css",
        new Map([
          [
            "button",
            {
              ...info("button", 5, "color: red"),
              composes: [{ classNames: ["base"], from: "./Button.module.scss" }],
            },
          ],
        ]),
      ),
    );
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "button", 10, "/fake/other.module.css"),
    ]);
    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
      styleDependencyGraph,
    );
    expect(diagnostics).toEqual([]);
  });

  it("classnameTransform: does not double-count unused alias entries", async () => {
    // `.btn-primary` is used via its original name; `.orphan` is unused.
    const base = parseStyleSelectorMap(
      `.btn-primary { color: red; }\n.orphan { color: blue; }`,
      SCSS_PATH,
    );
    const classMap = expandSelectorMapWithTransform(base, "camelCase");
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
    // Consumer references only via the CAMEL alias — the original
    // `btn-primary` has zero direct refs, but we still want exactly
    // one warning, not zero (via alias double-count) and not two.
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCase");

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      new WorkspaceSemanticWorkspaceReferenceIndex(),
    );
    expect(diagnostics.filter((d) => d.message.includes("btn-primary"))).toHaveLength(1);
  });

  it("classnameTransform: alias-form TSX access keeps the original marked as used", async () => {
    // `.btn-primary` is accessed ONLY via the camelCase alias from
    // a TSX file (`styles.btnPrimary`) — no canonical `cx('btn-primary')`
    // call exists. The reverse index canonicalises the alias access
    // under `btn-primary`, so the unused-selector check must find the
    // reference and skip the warning.
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCase");

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
    // `camelCaseOnly` drops the original from the class map entirely;
    // only `btnPrimary` remains with `originalName: "btn-primary"`.
    // The unused check must still emit exactly one warning for the
    // canonical `btn-primary` even though no entry keyed on that
    // name exists in the map.
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCaseOnly");
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
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, SCSS_PATH);
    const classMap = expandSelectorMapWithTransform(base, "camelCase");

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
    const classMap = new Map([
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

  it("reports an unresolved cross-file composed module", () => {
    const classMap = new Map([
      [
        "button",
        makeTestSelector("button", 1, {
          declarations: "color: red",
          composes: [
            {
              classNames: ["base"],
              classTokens: [
                {
                  className: "base",
                  range: {
                    start: { line: 1, character: 12 },
                    end: { line: 1, character: 16 },
                  },
                },
              ],
              from: "./Base.module.scss",
            },
          ],
        }),
      ],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "button", 5, SCSS_PATH),
    ]);

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
      undefined,
      () => null,
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe(DiagnosticSeverity.Warning);
    expect(diagnostics[0]!.message).toContain(
      "Cannot resolve composed CSS Module './Base.module.scss'.",
    );
    expect(diagnostics[0]!.data).toMatchObject({
      createModuleFile: {
        uri: "file:///fake/Base.module.scss",
      },
    });
  });

  it("reports a missing selector in a composed module", () => {
    const classMap = new Map([
      [
        "button",
        makeTestSelector("button", 1, {
          declarations: "color: red",
          composes: [
            {
              classNames: ["base"],
              classTokens: [
                {
                  className: "base",
                  range: {
                    start: { line: 1, character: 12 },
                    end: { line: 1, character: 16 },
                  },
                },
              ],
              from: "./Base.module.scss",
            },
          ],
        }),
      ],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "button", 5, SCSS_PATH),
    ]);
    const targetDocument = buildStyleDocumentFromSelectorMap(
      "/fake/Base.module.scss",
      new Map([["other", info("other", 1, "color: blue")]]),
    );

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDocument(classMap),
      semanticReferenceIndex,
      undefined,
      (filePath) => (filePath === "/fake/Base.module.scss" ? targetDocument : null),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe(DiagnosticSeverity.Warning);
    expect(diagnostics[0]!.message).toContain(
      "Selector '.base' not found in composed module './Base.module.scss'.",
    );
    expect(diagnostics[0]!.data).toMatchObject({
      createSelector: {
        uri: "file:///fake/Base.module.scss",
      },
    });
  });

  it("reports a missing imported @value module with create-file data", () => {
    const styleDoc = parseStyleDocument(
      `@value primary from "./tokens.module.scss";
.button { color: primary; }`,
      SCSS_PATH,
    );

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDoc,
      new WorkspaceSemanticWorkspaceReferenceIndex(),
      new WorkspaceStyleDependencyGraph(),
      () => null,
    );

    const diagnostic = diagnostics.find((entry) =>
      entry.message.includes("Cannot resolve imported @value module './tokens.module.scss'."),
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.data).toMatchObject({
      createModuleFile: {
        uri: "file:///fake/tokens.module.scss",
      },
    });
  });

  it("reports a missing imported @value binding", () => {
    const styleDoc = parseStyleDocument(
      `@value primary, secondary as accent from "./tokens.module.scss";
.button { color: accent; }`,
      SCSS_PATH,
    );

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDoc,
      new WorkspaceSemanticWorkspaceReferenceIndex(),
      new WorkspaceStyleDependencyGraph(),
      (filePath) =>
        filePath === "/fake/tokens.module.scss"
          ? parseStyleDocument(`@value primary: #ff3355;`, filePath)
          : null,
    );

    expect(
      diagnostics.some((entry) =>
        entry.message.includes(
          "@value 'secondary' not found in './tokens.module.scss' for local binding 'accent'.",
        ),
      ),
    ).toBe(true);
  });

  it("reports missing keyframes with create-keyframes data", () => {
    const styleDoc = parseStyleDocument(
      `.button {
  animation: fade 200ms ease-in;
}`,
      SCSS_PATH,
    );

    const diagnostics = computeScssUnusedDiagnostics(
      SCSS_PATH,
      styleDoc,
      new WorkspaceSemanticWorkspaceReferenceIndex(),
    );

    const diagnostic = diagnostics.find((entry) =>
      entry.message.includes("@keyframes 'fade' not found in this file."),
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic).toMatchObject({
      severity: DiagnosticSeverity.Warning,
      data: {
        createKeyframes: {
          uri: "file:///fake/Button.module.scss",
          newText: "@keyframes fade {\n}\n\n",
        },
      },
    });
  });
});
