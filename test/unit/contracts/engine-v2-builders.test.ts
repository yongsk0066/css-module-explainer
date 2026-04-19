import { describe, expect, it } from "vitest";
import {
  downcastEngineOutputV2ToV1,
  downcastFactsV2ToV1,
  normalizeResolvedTypeToTypeFactsV2,
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

  it("normalizes large unions into bundle-2 char-inclusion facts", () => {
    expect(
      normalizeResolvedTypeToTypeFactsV2({
        kind: "union",
        values: [
          "stateOne",
          "stateTwo",
          "stateThree",
          "stateFour",
          "stateFive",
          "stateSix",
          "stateSeven",
          "stateEight",
          "stateNine",
        ],
      }),
    ).toEqual({
      kind: "constrained",
      constraintKind: "charInclusion",
      charMust: "aest",
      charMay: "EFNOSTaeghinorstuvwx",
      provenance: "finiteSetWideningChars",
    });
  });

  it("normalizes large unions with shared edges into bundle-3 composite facts", () => {
    expect(
      normalizeResolvedTypeToTypeFactsV2({
        kind: "union",
        values: [
          "btn-primary",
          "btn-secondary",
          "btn-danger",
          "btn-success",
          "btn-warning",
          "btn-info",
          "btn-muted",
          "btn-ghost",
          "btn-outline",
        ],
      }),
    ).toEqual({
      kind: "constrained",
      constraintKind: "composite",
      prefix: "btn-",
      minLen: 8,
      charMust: "-bnt",
      charMay: "-abcdefghilmnoprstuwy",
      provenance: "finiteSetWideningComposite",
    });
  });

  it("downcasts v2 query metadata into the v1 output surface", () => {
    const output = downcastEngineOutputV2ToV1({
      version: "2",
      queryResults: [
        {
          kind: "expression-semantics",
          filePath: "/repo/src/App.tsx",
          queryId: "expr-1",
          payload: {
            expressionId: "expr-1",
            expressionKind: "symbolRef",
            styleFilePath: "/repo/src/App.module.scss",
            selectorNames: ["button"],
            candidateNames: ["button"],
            finiteValues: ["button"],
            valueDomainKind: "constrained",
            valueConstraintKind: "prefixSuffix",
            valuePrefix: "btn-",
            valueSuffix: "-chip",
            valueMinLen: 9,
            valueDomainReason: "known prefix and suffix preserved",
            selectorCertainty: "exact",
            selectorCertaintyShapeKind: "exact",
            selectorConstraintKind: "prefixSuffix",
            selectorCertaintyShapeLabel: "exact",
            selectorCertaintyReason: "single selector matched",
            valueCertainty: "inferred",
            valueCertaintyShapeKind: "constrained",
            valueCertaintyConstraintKind: "prefixSuffix",
            valueCertaintyShapeLabel: "constrained prefix+suffix",
            valueCertaintyReason: "analysis preserved constrained value shape",
            reason: "localFlow",
          },
        },
      ],
      rewritePlans: [],
      checkerReport: {
        version: "1",
        findings: [],
        summary: { warnings: 0, hints: 0, total: 0 },
      },
    });

    expect(output).toEqual({
      version: "1",
      queryResults: [
        {
          kind: "expression-semantics",
          filePath: "/repo/src/App.tsx",
          queryId: "expr-1",
          payload: {
            expressionId: "expr-1",
            expressionKind: "symbolRef",
            styleFilePath: "/repo/src/App.module.scss",
            selectorNames: ["button"],
            candidateNames: ["button"],
            finiteValues: ["button"],
            valueDomainKind: "constrained",
            valueDomainReason: "known prefix and suffix preserved",
            selectorCertainty: "exact",
            selectorCertaintyShapeLabel: "exact",
            selectorCertaintyReason: "single selector matched",
            valueCertainty: "inferred",
            valueCertaintyShapeLabel: "constrained prefix+suffix",
            valueCertaintyReason: "analysis preserved constrained value shape",
            reason: "localFlow",
          },
        },
      ],
      rewritePlans: [],
      checkerReport: {
        version: "1",
        findings: [],
        summary: { warnings: 0, hints: 0, total: 0 },
      },
    });
  });
});
