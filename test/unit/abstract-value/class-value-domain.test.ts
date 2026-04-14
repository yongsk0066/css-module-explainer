import { describe, expect, it } from "vitest";
import {
  BOTTOM_CLASS_VALUE,
  TOP_CLASS_VALUE,
  concatenateClassValues,
  concatenateWithUnknownRight,
  enumerateFiniteClassValues,
  exactClassValue,
  finiteSetClassValue,
  joinClassValues,
  prefixClassValue,
} from "../../../server/src/core/abstract-value/class-value-domain";

describe("class-value-domain", () => {
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

  it("derives prefixes from known left concatenation with unknown suffixes", () => {
    expect(concatenateWithUnknownRight(exactClassValue("btn-"))).toEqual(prefixClassValue("btn-"));
    expect(concatenateWithUnknownRight(finiteSetClassValue(["btn-", "btn--"]))).toEqual(
      prefixClassValue("btn-"),
    );
    expect(concatenateWithUnknownRight(finiteSetClassValue(["btn-", "card-"]))).toBe(
      TOP_CLASS_VALUE,
    );
  });
});
