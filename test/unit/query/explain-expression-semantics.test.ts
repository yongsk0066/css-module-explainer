import { describe, expect, it } from "vitest";
import {
  describeAbstractValue,
  describeAbstractValueReason,
} from "../../../server/engine-core-ts/src/core/query/explain-expression-semantics";

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

  it("explains prefix provenance reasons", () => {
    expect(
      describeAbstractValueReason({
        kind: "prefix",
        prefix: "btn-",
        provenance: "finiteSetConcatPrefixLcp",
      }),
    ).toBe("finite candidates concatenated with a prefix and reduced to their shared prefix");

    expect(
      describeAbstractValueReason({
        kind: "prefix",
        prefix: "btn-",
        provenance: "concatUnknownRight",
      }),
    ).toBe("known prefix preserved while concatenating an unknown suffix");
  });
});
