import { describe, expect, it } from "vitest";
import {
  deriveValueCertaintyProfile,
  deriveReferenceExpansion,
  deriveSelectorProjectionCertainty,
} from "../../../server/engine-core-ts/src/core/semantic/certainty";

describe("semantic/certainty", () => {
  it("keeps finite selector sets exact when the selector universe matches them exactly", () => {
    expect(
      deriveSelectorProjectionCertainty({ kind: "finiteSet", values: ["lg", "md", "sm"] }, 3, 4),
    ).toBe("exact");
  });

  it("keeps prefix projections inferred unless they cover the whole selector universe", () => {
    expect(deriveSelectorProjectionCertainty({ kind: "prefix", prefix: "btn-" }, 2, 3)).toBe(
      "inferred",
    );
    expect(deriveSelectorProjectionCertainty({ kind: "prefix", prefix: "btn-" }, 3, 3)).toBe(
      "exact",
    );
  });

  it("keeps top projections possible", () => {
    expect(deriveSelectorProjectionCertainty({ kind: "top" }, 3, 3)).toBe("possible");
  });

  it("derives current certainty profiles without changing the public certainty enum", () => {
    expect(
      deriveValueCertaintyProfile(
        { kind: "finiteSet", values: ["active", "indicator"] },
        "inferred",
      ),
    ).toEqual({
      certainty: "inferred",
      shapeKind: "boundedFinite",
      shapeLabel: "bounded finite (2)",
    });

    expect(deriveValueCertaintyProfile({ kind: "prefix", prefix: "btn-" }, "inferred")).toEqual({
      certainty: "inferred",
      shapeKind: "constrainedPrefix",
      shapeLabel: "constrained prefix `btn-`",
    });

    expect(deriveValueCertaintyProfile({ kind: "top" }, "possible")).toEqual({
      certainty: "possible",
      shapeKind: "unknown",
      shapeLabel: "unknown",
    });
  });

  it("keeps dynamic expressions expanded even when their selector certainty is exact", () => {
    expect(deriveReferenceExpansion("literal")).toBe("direct");
    expect(deriveReferenceExpansion("styleAccess")).toBe("direct");
    expect(deriveReferenceExpansion("template")).toBe("expanded");
    expect(deriveReferenceExpansion("symbolRef")).toBe("expanded");
  });
});
