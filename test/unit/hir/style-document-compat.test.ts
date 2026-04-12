import { describe, expect, it } from "vitest";
import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/builders/style-adapter";
import { styleDocumentToLegacyClassMap } from "../../../server/src/core/hir/compat/style-document-compat";

const ZERO = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };

describe("styleDocumentToLegacyClassMap", () => {
  it("preserves nested and alias metadata required by current providers", () => {
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
    const roundTrip = styleDocumentToLegacyClassMap(hir);

    expect(roundTrip.get("button--primary")).toEqual(classMap.get("button--primary"));
    expect(roundTrip.get("btnPrimary")).toEqual(classMap.get("btnPrimary"));
  });
});
