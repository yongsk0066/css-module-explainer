import { describe, expect, it } from "vitest";
import { describeAbstractValue } from "../../../server/src/core/query/explain-expression-semantics";

describe("describeAbstractValue", () => {
  it("labels widened prefixes explicitly", () => {
    expect(
      describeAbstractValue({
        kind: "prefix",
        prefix: "btn-",
        provenance: "finiteSetWidening",
      }),
    ).toBe("prefix `btn-` (widened)");
  });

  it("keeps non-widened prefixes plain", () => {
    expect(
      describeAbstractValue({
        kind: "prefix",
        prefix: "btn-",
        provenance: "concatUnknownRight",
      }),
    ).toBe("prefix `btn-`");
  });
});
