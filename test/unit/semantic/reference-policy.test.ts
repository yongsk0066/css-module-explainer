import { describe, expect, it } from "vitest";
import {
  filterSelectorReferencePolicy,
  matchesMinimumSelectorCertainty,
} from "../../../server/engine-core-ts/src/core/semantic/reference-policy";

describe("reference policy", () => {
  it("matches selector certainty by rank", () => {
    expect(matchesMinimumSelectorCertainty("exact", "inferred")).toBe(true);
    expect(matchesMinimumSelectorCertainty("inferred", "exact")).toBe(false);
    expect(matchesMinimumSelectorCertainty("possible", "possible")).toBe(true);
  });

  it("filters by certainty and expansion together", () => {
    const sites = [
      { selectorCertainty: "exact", expansion: "direct", label: "exact-direct" },
      { selectorCertainty: "exact", expansion: "expanded", label: "exact-expanded" },
      { selectorCertainty: "inferred", expansion: "expanded", label: "inferred-expanded" },
      { selectorCertainty: "possible", expansion: "expanded", label: "possible-expanded" },
    ] as const;

    expect(
      filterSelectorReferencePolicy(sites, {
        minimumSelectorCertainty: "inferred",
        includeExpanded: true,
      }).map((site) => site.label),
    ).toEqual(["exact-direct", "exact-expanded", "inferred-expanded"]);

    expect(
      filterSelectorReferencePolicy(sites, {
        minimumSelectorCertainty: "exact",
        includeExpanded: false,
      }).map((site) => site.label),
    ).toEqual(["exact-direct"]);
  });
});
