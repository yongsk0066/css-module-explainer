import { describe, expect, it } from "vitest";
import {
  describeAbstractValue,
  describeAbstractValueReason,
  describeValueCertaintyReason,
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

  it("explains inferred and possible certainty from domain provenance", () => {
    expect(
      describeValueCertaintyReason(
        {
          kind: "prefix",
          prefix: "btn-",
          provenance: "finiteSetWidening",
        },
        "inferred",
        "flowBranch",
      ),
    ).toBe("finite candidates widened to a shared prefix");

    expect(
      describeValueCertaintyReason(
        {
          kind: "finiteSet",
          values: ["active", "indicator"],
        },
        "inferred",
        "typeUnion",
      ),
    ).toBe("TypeScript exposed multiple string-literal candidates");

    expect(describeValueCertaintyReason({ kind: "top" }, "possible", "flowBranch")).toBe(
      "analysis lost finite shape information for this value",
    );
  });
});
