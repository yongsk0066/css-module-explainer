import type { ResolvedType } from "@css-module-explainer/shared";
import {
  finiteSetClassValue,
  type AbstractClassValue,
} from "../core/abstract-value/class-value-domain";
import type { StringTypeFactsV1, TypeFactTableEntryV1 } from "./engine-v1";
import type { StringTypeFactsV2, TypeFactTableEntryV2 } from "./engine-v2";

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

export function normalizeResolvedTypeToTypeFactsV2(resolvedType: ResolvedType): StringTypeFactsV2 {
  if (resolvedType.kind === "unresolvable") {
    return { kind: "unknown" };
  }

  return externalizeAbstractClassValueToTypeFactsV2(finiteSetClassValue(resolvedType.values));
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
        case "composite":
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
  return {
    filePath,
    expressionId,
    facts: normalizeResolvedTypeToTypeFactsV2(resolvedType),
  };
}

function externalizeAbstractClassValueToTypeFactsV2(value: AbstractClassValue): StringTypeFactsV2 {
  switch (value.kind) {
    case "bottom":
      return { kind: "unknown" };
    case "exact":
      return { kind: "exact", values: [value.value] };
    case "finiteSet":
      return { kind: "finiteSet", values: value.values };
    case "prefix":
      return {
        kind: "constrained",
        constraintKind: "prefix",
        prefix: value.prefix,
        ...(value.provenance ? { provenance: value.provenance } : {}),
      };
    case "suffix":
      return {
        kind: "constrained",
        constraintKind: "suffix",
        suffix: value.suffix,
        ...(value.provenance ? { provenance: value.provenance } : {}),
      };
    case "prefixSuffix":
      return {
        kind: "constrained",
        constraintKind: "prefixSuffix",
        prefix: value.prefix,
        suffix: value.suffix,
        minLen: value.minLength,
        ...(value.provenance ? { provenance: value.provenance } : {}),
      };
    case "charInclusion":
      return {
        kind: "constrained",
        constraintKind: "charInclusion",
        charMust: value.mustChars,
        charMay: value.mayChars,
        ...(value.mayIncludeOtherChars ? { mayIncludeOtherChars: true } : {}),
        ...(value.provenance ? { provenance: value.provenance } : {}),
      };
    case "composite":
      return {
        kind: "constrained",
        constraintKind: "composite",
        ...(value.prefix ? { prefix: value.prefix } : {}),
        ...(value.suffix ? { suffix: value.suffix } : {}),
        ...(value.minLength !== undefined ? { minLen: value.minLength } : {}),
        charMust: value.mustChars,
        charMay: value.mayChars,
        ...(value.mayIncludeOtherChars ? { mayIncludeOtherChars: true } : {}),
        ...(value.provenance ? { provenance: value.provenance } : {}),
      };
    case "top":
      return { kind: "top" };
    default:
      value satisfies never;
      return { kind: "unknown" };
  }
}
