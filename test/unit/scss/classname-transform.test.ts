import { describe, expect, it } from "vitest";
import {
  expandStyleDocumentWithTransform,
  transformClassname,
} from "../../../server/src/core/scss/classname-transform";
import { parseStyleDocument } from "../../../server/src/core/scss/scss-parser";
import {
  expandSelectorMapWithTransform,
  parseStyleSelectorMap,
} from "../../_fixtures/style-documents";

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

describe("expandSelectorMapWithTransform", () => {
  it("asIs short-circuits: returns the same reference", () => {
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "asIs");
    expect(out).toBe(base); // reference identity
  });

  it("camelCase expands `.btn-primary` into original + alias", () => {
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "camelCase");
    expect(out.size).toBe(2);
    expect(out.get("btn-primary")?.name).toBe("btn-primary");
    expect(out.get("btn-primary")?.originalName).toBeUndefined();
    expect(out.get("btnPrimary")?.name).toBe("btnPrimary");
    expect(out.get("btnPrimary")?.originalName).toBe("btn-primary");
  });

  it("camelCaseOnly drops the original entry", () => {
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "camelCaseOnly");
    expect(out.size).toBe(1);
    expect(out.has("btn-primary")).toBe(false);
    expect(out.has("btnPrimary")).toBe(true);
    expect(out.get("btnPrimary")?.originalName).toBe("btn-primary");
  });

  it("alias entries copy `range` by reference identity", () => {
    const base = parseStyleSelectorMap(`.btn-primary { color: red; }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "camelCase");
    const original = out.get("btn-primary")!;
    const alias = out.get("btnPrimary")!;
    expect(alias.range).toBe(original.range); // same object reference
  });

  it("alias entries copy `bemSuffix` by reference for nested BEM", () => {
    const base = parseStyleSelectorMap(`.btn-primary { &--xl {} }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "camelCase");
    const inner = out.get("btn-primary--xl");
    const alias = out.get("btnPrimaryXl");
    expect(inner?.bemSuffix).toBeDefined();
    expect(alias?.bemSuffix).toBe(inner?.bemSuffix); // reference identity
    expect(alias?.originalName).toBe("btn-primary--xl");
  });

  it("alias entries copy nested-safety metadata", () => {
    const base = parseStyleSelectorMap(`.btn-primary { &--xl {} }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "camelCase");
    expect(out.get("btnPrimaryXl")?.nestedSafety).toBe("bemSuffixSafe");
  });

  it("dedup: `.classNameB` in camelCase produces only the original", () => {
    const base = parseStyleSelectorMap(`.classNameB { color: red; }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "camelCase");
    expect(out.size).toBe(1);
    expect(out.has("classNameB")).toBe(true);
  });

  it("grouped-nested child `.btn { &--a, &--b {} }` preserves bemSuffix=undefined on aliases", () => {
    const base = parseStyleSelectorMap(`.btn { &--a, &--b {} }`, "/f.module.scss");
    const out = expandSelectorMapWithTransform(base, "camelCase");
    const btnA = out.get("btn--a");
    const btnAAlias = out.get("btnA");
    // Base parser marks the grouped-nested children with
    // bemSuffix undefined because the group rejects BEM-safe
    // rename. Expansion copies that undefined state via ...info
    // spread — alias also has no bemSuffix.
    expect(btnA?.bemSuffix).toBeUndefined();
    expect(btnAAlias?.bemSuffix).toBeUndefined();
  });
});

describe("expandStyleDocumentWithTransform", () => {
  it("camelCase expands canonical selectors into canonical + alias views", () => {
    const base = parseStyleDocument(`.btn-primary { color: red; }`, "/f.module.scss");
    const out = expandStyleDocumentWithTransform(base, "camelCase");

    expect(out.selectors.map((selector) => selector.name)).toEqual(["btn-primary", "btnPrimary"]);
    expect(out.selectors[0]).toMatchObject({
      name: "btn-primary",
      canonicalName: "btn-primary",
      viewKind: "canonical",
    });
    expect(out.selectors[1]).toMatchObject({
      name: "btnPrimary",
      canonicalName: "btn-primary",
      viewKind: "alias",
      originalName: "btn-primary",
    });
  });

  it("carries nested rename metadata onto alias views", () => {
    const base = parseStyleDocument(`.btn-primary { &--xl {} }`, "/f.module.scss");
    const out = expandStyleDocumentWithTransform(base, "camelCase");
    const canonical = out.selectors.find((selector) => selector.name === "btn-primary--xl");
    const alias = out.selectors.find((selector) => selector.name === "btnPrimaryXl");

    expect(canonical?.nestedSafety).toBe("bemSuffixSafe");
    expect(alias?.nestedSafety).toBe("bemSuffixSafe");
    expect(alias?.bemSuffix).toBe(canonical?.bemSuffix);
    expect(alias?.originalName).toBe("btn-primary--xl");
  });
});
