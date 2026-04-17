import { describe, expect, it } from "vitest";
import {
  BOTTOM_CLASS_VALUE,
  MAX_FINITE_CLASS_VALUES,
  TOP_CLASS_VALUE,
  type AbstractClassValue,
  concatenateClassValues,
  concatenateWithUnknownRight,
  enumerateFiniteClassValues,
  exactClassValue,
  finiteSetClassValue,
  joinClassValues,
  prefixClassValue,
} from "../../../server/engine-core-ts/src/core/abstract-value/class-value-domain";

describe("class-value-domain", () => {
  it("uses the expected concatenation table for core domain combinations", () => {
    const cases: ReadonlyArray<{
      name: string;
      left: AbstractClassValue;
      right: AbstractClassValue;
      expected: AbstractClassValue;
    }> = [
      {
        name: "bottom + exact => bottom",
        left: BOTTOM_CLASS_VALUE,
        right: exactClassValue("x"),
        expected: BOTTOM_CLASS_VALUE,
      },
      {
        name: "exact + bottom => bottom",
        left: exactClassValue("x"),
        right: BOTTOM_CLASS_VALUE,
        expected: BOTTOM_CLASS_VALUE,
      },
      {
        name: "top + exact => top",
        left: TOP_CLASS_VALUE,
        right: exactClassValue("x"),
        expected: TOP_CLASS_VALUE,
      },
      {
        name: "exact + top => top",
        left: exactClassValue("x"),
        right: TOP_CLASS_VALUE,
        expected: TOP_CLASS_VALUE,
      },
      {
        name: "exact + exact => exact",
        left: exactClassValue("btn-"),
        right: exactClassValue("lg"),
        expected: exactClassValue("btn-lg"),
      },
      {
        name: "exact + finiteSet => finiteSet",
        left: exactClassValue("btn-"),
        right: finiteSetClassValue(["sm", "lg"]),
        expected: finiteSetClassValue(["btn-sm", "btn-lg"]),
      },
      {
        name: "exact + prefix => prefix(left + right)",
        left: exactClassValue("btn-"),
        right: prefixClassValue("state-"),
        expected: prefixClassValue("btn-state-"),
      },
      {
        name: "finiteSet + exact => finiteSet",
        left: finiteSetClassValue(["btn-sm", "btn-lg"]),
        right: exactClassValue("--active"),
        expected: finiteSetClassValue(["btn-sm--active", "btn-lg--active"]),
      },
      {
        name: "finiteSet + finiteSet => cartesian finiteSet",
        left: finiteSetClassValue(["btn-", "card-"]),
        right: finiteSetClassValue(["sm", "lg"]),
        expected: finiteSetClassValue(["btn-sm", "btn-lg", "card-sm", "card-lg"]),
      },
      {
        name: "finiteSet + prefix stays top for now",
        left: finiteSetClassValue(["btn-", "card-"]),
        right: prefixClassValue("state-"),
        expected: TOP_CLASS_VALUE,
      },
      {
        name: "prefix + exact preserves left prefix",
        left: prefixClassValue("btn-"),
        right: exactClassValue("active"),
        expected: prefixClassValue("btn-"),
      },
      {
        name: "prefix + finiteSet preserves left prefix",
        left: prefixClassValue("btn-"),
        right: finiteSetClassValue(["sm", "lg"]),
        expected: prefixClassValue("btn-"),
      },
      {
        name: "prefix + prefix preserves left prefix",
        left: prefixClassValue("btn-"),
        right: prefixClassValue("state-"),
        expected: prefixClassValue("btn-"),
      },
    ];

    for (const { name, left, right, expected } of cases) {
      expect(concatenateClassValues(left, right), name).toEqual(expected);
    }
  });

  it("canonicalizes singleton finite sets to exact values", () => {
    expect(finiteSetClassValue(["button"])).toEqual(exactClassValue("button"));
  });

  it("canonicalizes empty finite sets to bottom", () => {
    expect(finiteSetClassValue([])).toBe(BOTTOM_CLASS_VALUE);
  });

  it("normalizes finite sets by uniqueness and ordering", () => {
    expect(finiteSetClassValue(["lg", "sm", "lg", "md"])).toEqual({
      kind: "finiteSet",
      values: ["lg", "md", "sm"],
    });
  });

  it("joins exact values into a finite set", () => {
    expect(joinClassValues(exactClassValue("sm"), exactClassValue("lg"))).toEqual({
      kind: "finiteSet",
      values: ["lg", "sm"],
    });
  });

  it("keeps a prefix when all finite values fit inside it", () => {
    expect(joinClassValues(prefixClassValue("btn-"), exactClassValue("btn-primary"))).toEqual(
      prefixClassValue("btn-"),
    );
    expect(
      joinClassValues(
        prefixClassValue("btn-"),
        finiteSetClassValue(["btn-primary", "btn-secondary"]),
      ),
    ).toEqual(prefixClassValue("btn-"));
  });

  it("widens to top when a finite value escapes a prefix", () => {
    expect(joinClassValues(prefixClassValue("btn-"), exactClassValue("card"))).toBe(
      TOP_CLASS_VALUE,
    );
  });

  it("widens incompatible prefixes to top", () => {
    expect(joinClassValues(prefixClassValue("btn-"), prefixClassValue("card-"))).toBe(
      TOP_CLASS_VALUE,
    );
  });

  it("keeps a meaningful longest common prefix when joining related prefixes", () => {
    expect(joinClassValues(prefixClassValue("btn-sm"), prefixClassValue("btn-lg"))).toEqual(
      prefixClassValue("btn-", "prefixJoinLcp"),
    );
    expect(joinClassValues(prefixClassValue("btn"), prefixClassValue("btn--danger"))).toEqual(
      prefixClassValue("btn", "prefixJoinLcp"),
    );
  });

  it("drops unhelpful prefix joins that do not preserve a class boundary", () => {
    expect(
      joinClassValues(prefixClassValue("buttonPrimary"), prefixClassValue("buttonSecondary")),
    ).toBe(TOP_CLASS_VALUE);
  });

  it("enumerates only finite domains", () => {
    expect(enumerateFiniteClassValues(BOTTOM_CLASS_VALUE)).toEqual([]);
    expect(enumerateFiniteClassValues(exactClassValue("button"))).toEqual(["button"]);
    expect(enumerateFiniteClassValues(finiteSetClassValue(["sm", "lg"]))).toEqual(["lg", "sm"]);
    expect(enumerateFiniteClassValues(prefixClassValue("btn-"))).toBeNull();
    expect(enumerateFiniteClassValues(TOP_CLASS_VALUE)).toBeNull();
  });

  it("concatenates exact and finite values into derived exact/finite results", () => {
    expect(concatenateClassValues(exactClassValue("btn-"), exactClassValue("lg"))).toEqual(
      exactClassValue("btn-lg"),
    );
    expect(
      concatenateClassValues(exactClassValue("btn-"), finiteSetClassValue(["sm", "lg"])),
    ).toEqual({
      kind: "finiteSet",
      values: ["btn-lg", "btn-sm"],
    });
  });

  it("preserves a known left prefix under concatenation with more precise right values", () => {
    expect(concatenateClassValues(prefixClassValue("btn-"), exactClassValue("primary"))).toEqual(
      prefixClassValue("btn-"),
    );
    expect(
      concatenateClassValues(prefixClassValue("btn-"), finiteSetClassValue(["sm", "lg"])),
    ).toEqual(prefixClassValue("btn-"));
    expect(concatenateClassValues(prefixClassValue("btn-"), prefixClassValue("variant-"))).toEqual(
      prefixClassValue("btn-"),
    );
  });

  it("derives prefixes from known left concatenation with unknown suffixes", () => {
    expect(concatenateWithUnknownRight(exactClassValue("btn-"))).toEqual(
      prefixClassValue("btn-", "concatUnknownRight"),
    );
    expect(concatenateWithUnknownRight(finiteSetClassValue(["btn-", "btn--"]))).toEqual(
      prefixClassValue("btn-", "concatUnknownRight"),
    );
    expect(concatenateWithUnknownRight(finiteSetClassValue(["btn-", "card-"]))).toBe(
      TOP_CLASS_VALUE,
    );
  });

  it("widens large finite sets to a prefix when a meaningful LCP exists", () => {
    const values = Array.from(
      { length: MAX_FINITE_CLASS_VALUES + 1 },
      (_, index) => `btn-${index}`,
    );
    expect(finiteSetClassValue(values)).toEqual(prefixClassValue("btn-", "finiteSetWidening"));
  });

  it("widens large finite sets to top when no meaningful LCP exists", () => {
    const values = Array.from(
      { length: MAX_FINITE_CLASS_VALUES + 1 },
      (_, index) => `state${index}`,
    );
    expect(finiteSetClassValue(values)).toBe(TOP_CLASS_VALUE);
  });
});
