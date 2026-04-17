import type { ResolvedType } from "@css-module-explainer/shared";
import type { StringTypeFactsV1, TypeFactTableEntryV1 } from "./engine-v1";
import type { StringTypeFactsV2, TypeFactTableEntryV2 } from "./engine-v2";
import { createTypeFactTableEntryV1 } from "./engine-v1-builders";

export function upcastFactsV1ToV2(facts: StringTypeFactsV1): StringTypeFactsV2 {
  switch (facts.kind) {
    case "unknown":
      return { kind: "unknown" };
    case "exact":
      return { kind: "exact", ...(facts.values ? { values: facts.values } : {}) };
    case "finiteSet":
      return { kind: "finiteSet", ...(facts.values ? { values: facts.values } : {}) };
    case "top":
      return { kind: "top" };
    case "prefix":
      return {
        kind: "constrained",
        constraintKind: "prefix",
        ...(facts.prefix ? { prefix: facts.prefix } : {}),
      };
    default:
      return { kind: "unknown" };
  }
}

export function downcastFactsV2ToV1(facts: StringTypeFactsV2): StringTypeFactsV1 {
  switch (facts.kind) {
    case "unknown":
      return { kind: "unknown" };
    case "exact":
      return { kind: "exact", ...(facts.values ? { values: facts.values } : {}) };
    case "finiteSet":
      return { kind: "finiteSet", ...(facts.values ? { values: facts.values } : {}) };
    case "top":
      return { kind: "top" };
    case "constrained":
      switch (facts.constraintKind) {
        case "prefix":
          return facts.prefix ? { kind: "prefix", prefix: facts.prefix } : { kind: "top" };
        case "prefixSuffix":
          return facts.prefix ? { kind: "prefix", prefix: facts.prefix } : { kind: "top" };
        case "charInclusion":
        case "suffix":
        case undefined:
          return { kind: "top" };
        default:
          facts.constraintKind satisfies never;
          return { kind: "top" };
      }
    default:
      return { kind: "unknown" };
  }
}

export function upcastTypeFactTableEntryV1ToV2(entry: TypeFactTableEntryV1): TypeFactTableEntryV2 {
  return {
    filePath: entry.filePath,
    expressionId: entry.expressionId,
    facts: upcastFactsV1ToV2(entry.facts),
  };
}

export function createTypeFactTableEntryV2(
  filePath: string,
  expressionId: string,
  resolvedType: ResolvedType,
): TypeFactTableEntryV2 {
  return upcastTypeFactTableEntryV1ToV2(
    createTypeFactTableEntryV1(filePath, expressionId, resolvedType),
  );
}
