import { describe, expect, it } from "vitest";
import {
  downcastFactsV2ToV1,
  upcastFactsV1ToV2,
} from "../../../server/engine-core-ts/src/contracts";

describe("engine-v2 builders", () => {
  it("upcasts prefix facts into constrained facts", () => {
    expect(upcastFactsV1ToV2({ kind: "prefix", prefix: "btn-" })).toEqual({
      kind: "constrained",
      constraintKind: "prefix",
      prefix: "btn-",
    });
  });

  it("downcasts bundle-1 constrained facts soundly", () => {
    expect(
      downcastFactsV2ToV1({
        kind: "constrained",
        constraintKind: "suffix",
        suffix: "-chip",
      }),
    ).toEqual({ kind: "top" });

    expect(
      downcastFactsV2ToV1({
        kind: "constrained",
        constraintKind: "prefixSuffix",
        prefix: "btn-",
        suffix: "-chip",
        minLen: 9,
      }),
    ).toEqual({ kind: "prefix", prefix: "btn-" });

    expect(
      downcastFactsV2ToV1({
        kind: "constrained",
        constraintKind: "charInclusion",
        charMust: "aest",
        charMay: "EFNOSTaeghinorstuvwx",
      }),
    ).toEqual({ kind: "top" });
  });
});
