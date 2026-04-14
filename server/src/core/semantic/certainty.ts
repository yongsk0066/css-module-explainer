import {
  enumerateFiniteClassValues,
  type AbstractClassValue,
} from "../abstract-value/class-value-domain";
import type { SourceExpressionKind } from "../hir/source-types";

export type EdgeCertainty = "exact" | "inferred" | "possible";

export function rankCertainty(certainty: EdgeCertainty): number {
  switch (certainty) {
    case "exact":
      return 3;
    case "inferred":
      return 2;
    case "possible":
      return 1;
    default:
      certainty satisfies never;
      return certainty;
  }
}

export function isAtLeastInferred(certainty: EdgeCertainty): boolean {
  return rankCertainty(certainty) >= rankCertainty("inferred");
}

export function deriveSelectorProjectionCertainty(
  value: AbstractClassValue,
  matchedSelectorCount: number,
  selectorUniverseCount: number,
): EdgeCertainty {
  switch (value.kind) {
    case "bottom":
      return "possible";
    case "exact":
      return matchedSelectorCount === 1 ? "exact" : "possible";
    case "finiteSet": {
      const finiteValues = enumerateFiniteClassValues(value);
      if (!finiteValues || finiteValues.length === 0) return "possible";
      return matchedSelectorCount === finiteValues.length ? "exact" : "inferred";
    }
    case "prefix":
      if (matchedSelectorCount === 0) return "possible";
      return matchedSelectorCount === selectorUniverseCount ? "exact" : "inferred";
    case "top":
      return "possible";
    default:
      value satisfies never;
      return value;
  }
}

export function deriveReferenceExpansion(
  expressionKind: SourceExpressionKind,
): "direct" | "expanded" {
  switch (expressionKind) {
    case "literal":
    case "styleAccess":
      return "direct";
    case "template":
    case "symbolRef":
      return "expanded";
    default:
      expressionKind satisfies never;
      return expressionKind;
  }
}
