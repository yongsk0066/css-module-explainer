import { describe, expect, it } from "vitest";
import type { ClassExpressionHIR } from "../../../server/src/core/hir/source-types";
import type { SelectorDeclHIR } from "../../../server/src/core/hir/style-types";
import type { SelectorStyleDependencySummary } from "../../../server/src/core/query/read-selector-style-dependencies";
import { renderHover } from "../../../server/src/providers/hover-renderer";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";

const staticExpression: ClassExpressionHIR = {
  kind: "literal",
  id: "expr:literal",
  className: "indicator",
  range: {
    start: { line: 4, character: 15 },
    end: { line: 4, character: 24 },
  },
  scssModulePath: SCSS_PATH,
  origin: "cxCall",
};

const templateExpression: ClassExpressionHIR = {
  kind: "template",
  id: "expr:template",
  rawTemplate: "btn-${variant}",
  staticPrefix: "btn-",
  range: {
    start: { line: 4, character: 15 },
    end: { line: 4, character: 28 },
  },
  scssModulePath: SCSS_PATH,
  origin: "cxCall",
};

const symbolExpression: ClassExpressionHIR = {
  kind: "symbolRef",
  id: "expr:symbol",
  rawReference: "size",
  rootName: "size",
  pathSegments: [],
  range: {
    start: { line: 4, character: 15 },
    end: { line: 4, character: 19 },
  },
  scssModulePath: SCSS_PATH,
  origin: "cxCall",
};

function selector(name: string, line: number, declarations: string): SelectorDeclHIR {
  return {
    kind: "selector",
    id: `selector:${name}:${line}`,
    name,
    canonicalName: name,
    viewKind: "canonical",
    range: { start: { line, character: 2 }, end: { line, character: 2 + name.length } },
    fullSelector: `.${name}`,
    declarations,
    ruleRange: { start: { line, character: 0 }, end: { line: line + 3, character: 1 } },
    composes: [],
    nestedSafety: "flat",
  };
}

describe("renderHover", () => {
  it("returns null when no selectors match", () => {
    expect(
      renderHover({
        expression: staticExpression,
        scssModulePath: SCSS_PATH,
        selectors: [],
        workspaceRoot: "/fake/ws",
      }),
    ).toBeNull();
  });

  it("renders a single-match card with workspace-relative location", () => {
    const markdown = renderHover({
      expression: staticExpression,
      scssModulePath: SCSS_PATH,
      selectors: [selector("indicator", 11, "color: red; font-size: 14px")],
      workspaceRoot: "/fake/ws",
    });
    expect(markdown).toContain("**`.indicator`**");
    expect(markdown).toContain("src/Button.module.scss:12");
    expect(markdown).toContain("```scss");
    expect(markdown).toContain("  color: red;");
    expect(markdown).toContain("  font-size: 14px;");
  });

  it("renders a multi-match template card", () => {
    const markdown = renderHover({
      expression: templateExpression,
      scssModulePath: SCSS_PATH,
      selectors: [
        selector("btn-primary", 10, "color: white"),
        selector("btn-secondary", 14, "color: gray"),
      ],
      workspaceRoot: "/fake/ws",
    });
    expect(markdown).toContain("**2 matches** for `cx(");
    expect(markdown).toContain("btn-${...}");
    expect(markdown).toContain(".btn-primary");
    expect(markdown).toContain(".btn-secondary");
    expect(markdown).toContain("---"); // section separator
  });

  it("renders a multi-match variable card", () => {
    const markdown = renderHover({
      expression: symbolExpression,
      scssModulePath: SCSS_PATH,
      selectors: [
        selector("small", 10, "font-size: 12px"),
        selector("medium", 14, "font-size: 16px"),
      ],
      workspaceRoot: "/fake/ws",
    });
    expect(markdown).toContain("**2 matches** for `cx(size)`");
  });

  it("renders abstract value summaries for dynamic explanations", () => {
    const markdown = renderHover({
      expression: symbolExpression,
      scssModulePath: SCSS_PATH,
      selectors: [
        selector("small", 10, "font-size: 12px"),
        selector("medium", 14, "font-size: 16px"),
      ],
      workspaceRoot: "/fake/ws",
      dynamicExplanation: {
        kind: "symbolRef",
        subject: "size",
        candidates: ["small", "medium"],
        valueDomainLabel: "finite set (2)",
        valueCertainty: "exact",
        selectorCertainty: "inferred",
        reasonLabel: "TypeScript string-literal union analysis",
      },
    });
    expect(markdown).toContain("Value domain: finite set (2).");
    expect(markdown).toContain("Value certainty: exact.");
    expect(markdown).toContain("Selector certainty: inferred.");
  });

  it("caps multi-match at MAX_CANDIDATES=10 with a tail summary", () => {
    const many = Array.from({ length: 15 }, (_, i) => selector(`item-${i}`, i + 1, "color: red"));
    const markdown = renderHover({
      expression: templateExpression,
      scssModulePath: SCSS_PATH,
      selectors: many,
      workspaceRoot: "/fake/ws",
    });
    expect(markdown).toContain("**15 matches**");
    expect(markdown).toContain("…and 5 more");
    // First 10 are shown, 11th (item-10) should NOT appear in full
    expect(markdown).toContain(".item-0");
    expect(markdown).toContain(".item-9");
    expect(markdown).not.toContain(".item-10 {");
  });

  it("falls back to the raw scss path when workspaceRoot equals scssModulePath", () => {
    const markdown = renderHover({
      expression: staticExpression,
      scssModulePath: "/same",
      selectors: [selector("only", 3, "color: red")],
      workspaceRoot: "/same",
    });
    // relative("/same", "/same") === "" → fallback to raw path
    expect(markdown).toContain("/same:4");
  });

  it("handles an empty declarations string with empty braces", () => {
    const markdown = renderHover({
      expression: staticExpression,
      scssModulePath: SCSS_PATH,
      selectors: [selector("empty", 5, "")],
      workspaceRoot: "/fake/ws",
    });
    expect(markdown).toContain(".empty {}");
  });

  it("renders incoming composes dependencies", () => {
    const dependencies = new Map<string, SelectorStyleDependencySummary>([
      [
        "indicator",
        {
          incoming: [
            {
              canonicalName: "card",
              filePath: "/fake/ws/src/Card.module.scss",
              reason: "crossFileComposes",
            },
          ],
          outgoing: [],
        },
      ],
    ]);

    const markdown = renderHover({
      expression: staticExpression,
      scssModulePath: SCSS_PATH,
      selectors: [selector("indicator", 11, "color: red;")],
      styleDependenciesBySelector: dependencies,
      workspaceRoot: "/fake/ws",
    });

    expect(markdown).toContain("Composed by:");
    expect(markdown).toContain("`card` in `src/Card.module.scss`");
  });
});
