import { describe, expect, it } from "vitest";
import type {
  StaticClassCall,
  TemplateLiteralCall,
  VariableRefCall,
} from "@css-module-explainer/shared";
import { renderHover } from "../../../server/src/providers/hover-renderer";
import { infoWithDeclarations as info } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";

const staticCall: StaticClassCall = {
  kind: "static",
  className: "indicator",
  originRange: {
    start: { line: 4, character: 15 },
    end: { line: 4, character: 24 },
  },
  scssModulePath: SCSS_PATH,
};

const templateCall: TemplateLiteralCall = {
  kind: "template",
  rawTemplate: "btn-${variant}",
  staticPrefix: "btn-",
  originRange: {
    start: { line: 4, character: 15 },
    end: { line: 4, character: 28 },
  },
  scssModulePath: SCSS_PATH,
};

const variableCall: VariableRefCall = {
  kind: "variable",
  variableName: "size",
  originRange: {
    start: { line: 4, character: 15 },
    end: { line: 4, character: 19 },
  },
  scssModulePath: SCSS_PATH,
};

describe("renderHover", () => {
  it("returns null when no infos match", () => {
    expect(
      renderHover({
        call: staticCall,
        scssModulePath: SCSS_PATH,
        infos: [],
        workspaceRoot: "/fake/ws",
      }),
    ).toBeNull();
  });

  it("renders a single-match card with workspace-relative location", () => {
    const markdown = renderHover({
      call: staticCall,
      scssModulePath: SCSS_PATH,
      infos: [info("indicator", 11, "color: red; font-size: 14px")],
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
      call: templateCall,
      scssModulePath: SCSS_PATH,
      infos: [info("btn-primary", 10, "color: white"), info("btn-secondary", 14, "color: gray")],
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
      call: variableCall,
      scssModulePath: SCSS_PATH,
      infos: [info("small", 10, "font-size: 12px"), info("medium", 14, "font-size: 16px")],
      workspaceRoot: "/fake/ws",
    });
    expect(markdown).toContain("**2 matches** for `cx(size)`");
  });

  it("caps multi-match at MAX_CANDIDATES=10 with a tail summary", () => {
    const many = Array.from({ length: 15 }, (_, i) => info(`item-${i}`, i + 1, "color: red"));
    const markdown = renderHover({
      call: templateCall,
      scssModulePath: SCSS_PATH,
      infos: many,
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
      call: staticCall,
      scssModulePath: "/same",
      infos: [info("only", 3, "color: red")],
      workspaceRoot: "/same",
    });
    // relative("/same", "/same") === "" → fallback to raw path
    expect(markdown).toContain("/same:4");
  });

  it("handles an empty declarations string with empty braces", () => {
    const markdown = renderHover({
      call: staticCall,
      scssModulePath: SCSS_PATH,
      infos: [info("empty", 5, "")],
      workspaceRoot: "/fake/ws",
    });
    expect(markdown).toContain(".empty {}");
  });
});
