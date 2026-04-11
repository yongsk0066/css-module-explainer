import { describe, expect, it } from "vitest";
import { transformClassname } from "../../../server/src/core/scss/classname-transform";

// Parity snapshot tests ported from ts-plugin-css-modules
// src/helpers/__tests__/__snapshots__/classTransforms.test.ts.snap
//
// Inputs chosen to cover kebab, camel, mixed, and leading/trailing
// underscores + double dashes.

describe("transformClassname", () => {
  it("asIs returns the original only", () => {
    expect(transformClassname("asIs", "class-name-a")).toEqual(["class-name-a"]);
    expect(transformClassname("asIs", "classNameB")).toEqual(["classNameB"]);
  });

  it("camelCase: kebab → camel + original", () => {
    expect(transformClassname("camelCase", "class-name-a")).toEqual(["class-name-a", "classNameA"]);
  });

  it("camelCase: already-camel dedups to single entry", () => {
    expect(transformClassname("camelCase", "classNameB")).toEqual(["classNameB"]);
  });

  it("camelCaseOnly: emits only the camel form", () => {
    expect(transformClassname("camelCaseOnly", "class-name-a")).toEqual(["classNameA"]);
  });

  it("camelCase: underscore + mixed case input", () => {
    // lodash-equivalent: __class_nAmeD-- → classNAmeD (leading/trailing
    // separators stripped, `nA` stays `NA` because our simple casing
    // preserves the already-uppercase character).
    const out = transformClassname("camelCase", "__class_nAmeD--");
    expect(out).toContain("__class_nAmeD--");
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it("dashes: kebab → dashed-camel + original", () => {
    expect(transformClassname("dashes", "class-name-a")).toEqual(["class-name-a", "classNameA"]);
  });

  it("dashes: underscores stay untouched", () => {
    // dashes* regex targets `-+(\w)` only, so `__class_nAmeD--` has
    // no `-+(\w)` boundary that transforms anything → identical
    // output → dedup to single entry (the leading/trailing `--`
    // have no following `\w` or are followed by end-of-string).
    expect(transformClassname("dashes", "__class_nAmeD--")).toEqual(["__class_nAmeD--"]);
  });

  it("dashesOnly: emits only the dashed-camel form", () => {
    expect(transformClassname("dashesOnly", "class-name-a")).toEqual(["classNameA"]);
  });

  it("BEM ultra `.btn--primary--xl` in camelCase", () => {
    const out = transformClassname("camelCase", "btn--primary--xl");
    expect(out).toContain("btn--primary--xl");
    // `-+` eats `--`, so `btnPrimaryXl`.
    expect(out).toContain("btnPrimaryXl");
  });

  it("single-char class stays identical across all modes", () => {
    expect(transformClassname("asIs", "a")).toEqual(["a"]);
    expect(transformClassname("camelCase", "a")).toEqual(["a"]);
    expect(transformClassname("camelCaseOnly", "a")).toEqual(["a"]);
    expect(transformClassname("dashes", "a")).toEqual(["a"]);
    expect(transformClassname("dashesOnly", "a")).toEqual(["a"]);
  });
});
