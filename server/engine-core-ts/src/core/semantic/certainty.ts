import {
  enumerateFiniteClassValues,
  type AbstractClassValue,
} from "../abstract-value/class-value-domain";
import type { SourceExpressionKind } from "../hir/source-types";

export type EdgeCertainty = "exact" | "inferred" | "possible";

export type ValueCertaintyShapeKind = "exact" | "boundedFinite" | "constrainedPrefix" | "unknown";
export type SelectorCertaintyShapeKind = "exact" | "boundedFinite" | "constrained" | "unknown";

export interface ValueCertaintyProfile {
  readonly certainty: EdgeCertainty;
  readonly shapeKind: ValueCertaintyShapeKind;
  readonly shapeLabel: string;
}

export interface SelectorCertaintyProfile {
  readonly certainty: EdgeCertainty;
  readonly shapeKind: SelectorCertaintyShapeKind;
  readonly shapeLabel: string;
}

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

export function deriveValueCertaintyProfile(
  value: AbstractClassValue | undefined,
  certainty: EdgeCertainty | undefined,
): ValueCertaintyProfile | null {
  if (!value || !certainty) return null;

  switch (certainty) {
    case "exact":
      return {
        certainty,
        shapeKind: "exact",
        shapeLabel: "exact",
      };
    case "inferred":
      switch (value.kind) {
        case "finiteSet":
          return {
            certainty,
            shapeKind: "boundedFinite",
            shapeLabel: `bounded finite (${value.values.length})`,
          };
        case "prefix":
          return {
            certainty,
            shapeKind: "constrainedPrefix",
            shapeLabel: `constrained prefix \`${value.prefix}\``,
          };
        case "suffix":
          return null;
        case "prefixSuffix":
          return null;
        case "exact":
          return {
            certainty,
            shapeKind: "exact",
            shapeLabel: "exact",
          };
        case "bottom":
        case "top":
          return {
            certainty,
            shapeKind: "unknown",
            shapeLabel: "unknown",
          };
        default:
          value satisfies never;
          return null;
      }
    case "possible":
      return {
        certainty,
        shapeKind: "unknown",
        shapeLabel: "unknown",
      };
    default:
      certainty satisfies never;
      return null;
  }
}

export function deriveSelectorCertaintyProfile(
  matchedSelectorCount: number,
  certainty: EdgeCertainty | undefined,
  value: AbstractClassValue | undefined,
): SelectorCertaintyProfile | null {
  if (!certainty) return null;

  switch (certainty) {
    case "exact":
      return {
        certainty,
        shapeKind: "exact",
        shapeLabel: "exact",
      };
    case "inferred":
      if (value?.kind === "prefix" || value?.kind === "suffix" || value?.kind === "prefixSuffix") {
        return {
          certainty,
          shapeKind: "constrained",
          shapeLabel: `constrained selector set (${matchedSelectorCount})`,
        };
      }
      return {
        certainty,
        shapeKind: "boundedFinite",
        shapeLabel: `bounded selector set (${matchedSelectorCount})`,
      };
    case "possible":
      return {
        certainty,
        shapeKind: "unknown",
        shapeLabel: "unknown",
      };
    default:
      certainty satisfies never;
      return null;
  }
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
    case "suffix":
    case "prefixSuffix":
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
