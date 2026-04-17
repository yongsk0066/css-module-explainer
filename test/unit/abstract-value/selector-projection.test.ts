import { describe, expect, it } from "vitest";
import {
  TOP_CLASS_VALUE,
  exactClassValue,
  finiteSetClassValue,
  prefixClassValue,
  suffixClassValue,
} from "../../../server/engine-core-ts/src/core/abstract-value/class-value-domain";
import { resolveAbstractValueSelectors } from "../../../server/engine-core-ts/src/core/abstract-value/selector-projection";
import { info } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

const styleDocument = buildStyleDocumentFromSelectorMap(
  "/fake/ws/src/Button.module.scss",
  new Map([
    ["button", info("button")],
    ["btn-primary", info("btn-primary")],
    ["btn-secondary", info("btn-secondary")],
  ]),
);

describe("resolveAbstractValueSelectors", () => {
  it("projects exact values to canonical selectors", () => {
    expect(
      resolveAbstractValueSelectors(exactClassValue("button"), styleDocument).map(
        (selector) => selector.name,
      ),
    ).toEqual(["button"]);
  });

  it("projects finite sets to multiple selectors", () => {
    expect(
      resolveAbstractValueSelectors(
        finiteSetClassValue(["btn-secondary", "btn-primary"]),
        styleDocument,
      ).map((selector) => selector.name),
    ).toEqual(["btn-primary", "btn-secondary"]);
  });

  it("projects prefixes to matching canonical selectors", () => {
    expect(
      resolveAbstractValueSelectors(prefixClassValue("btn-"), styleDocument).map(
        (selector) => selector.name,
      ),
    ).toEqual(["btn-primary", "btn-secondary"]);
  });

  it("projects suffixes to matching canonical selectors", () => {
    expect(
      resolveAbstractValueSelectors(suffixClassValue("-primary"), styleDocument).map(
        (selector) => selector.name,
      ),
    ).toEqual(["btn-primary"]);
  });

  it("treats top as the whole canonical selector universe", () => {
    expect(
      resolveAbstractValueSelectors(TOP_CLASS_VALUE, styleDocument)
        .map((selector) => selector.name)
        .toSorted(),
    ).toEqual(["btn-primary", "btn-secondary", "button"]);
  });
});
