import { describe, expect, it } from "vitest";
import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/builders/style-adapter";

const ZERO = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };

describe("buildStyleDocumentFromClassMap", () => {
  it("classifies BEM-safe nested selectors distinctly from flat selectors", () => {
    const classMap = new Map<string, SelectorInfo>([
      [
        "button--primary",
        {
          name: "button--primary",
          range: ZERO,
          fullSelector: ".button--primary",
          declarations: "color: red",
          ruleRange: ZERO,
          isNested: true,
          bemSuffix: {
            rawTokenRange: ZERO,
            rawToken: "&--primary",
            parentResolvedName: "button",
          },
        },
      ],
    ]) as ScssClassMap;

    const hir = buildStyleDocumentFromClassMap("/fake/Button.module.scss", classMap);
    expect(hir.selectors.map((selector) => selector.name)).toContain("button--primary");
    const nested = hir.selectors.find((selector) => selector.name === "button--primary");
    expect(nested).toMatchObject({
      nestedSafety: "bemSuffixSafe",
      canonicalName: "button--primary",
      viewKind: "canonical",
    });
  });

  it("preserves alias views with canonical back-pointers", () => {
    const classMap = new Map<string, SelectorInfo>([
      [
        "btnPrimary",
        {
          name: "btnPrimary",
          range: ZERO,
          fullSelector: ".btn-primary",
          declarations: "color: red",
          ruleRange: ZERO,
          originalName: "btn-primary",
        },
      ],
    ]) as ScssClassMap;

    const hir = buildStyleDocumentFromClassMap("/fake/Button.module.scss", classMap);
    expect(hir.selectors).toHaveLength(1);
    expect(hir.selectors[0]).toMatchObject({
      name: "btnPrimary",
      canonicalName: "btn-primary",
      viewKind: "alias",
      originalName: "btn-primary",
    });
  });
});
