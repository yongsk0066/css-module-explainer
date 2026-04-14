import { describe, expect, it } from "vitest";
import {
  deriveReferenceExpansion,
  deriveSelectorProjectionCertainty,
} from "../../../server/src/core/semantic/certainty";

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

  it("keeps dynamic expressions expanded even when their selector certainty is exact", () => {
    expect(deriveReferenceExpansion("literal")).toBe("direct");
    expect(deriveReferenceExpansion("styleAccess")).toBe("direct");
    expect(deriveReferenceExpansion("template")).toBe("expanded");
    expect(deriveReferenceExpansion("symbolRef")).toBe("expanded");
  });
});
