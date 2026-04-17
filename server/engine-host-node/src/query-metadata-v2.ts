import type { StringConstraintKindV2, ValueDomainKindV2 } from "../../engine-core-ts/src/contracts";
import type { SourceExpressionResolution } from "../../engine-core-ts/src/core/query/read-source-expression-resolution";

export function classifyValueDomainV2(
  abstractValue?: SourceExpressionResolution["abstractValue"],
): {
  readonly kind: ValueDomainKindV2;
  readonly constraintKind?: StringConstraintKindV2;
  readonly charMust?: string;
  readonly charMay?: string;
  readonly mayIncludeOtherChars?: boolean;
} {
  if (!abstractValue) return { kind: "none" };

  switch (abstractValue.kind) {
    case "bottom":
      return { kind: "none" };
    case "exact":
      return { kind: "exact" };
    case "finiteSet":
      return { kind: "finiteSet" };
    case "prefix":
      return { kind: "constrained", constraintKind: "prefix" };
    case "suffix":
      return { kind: "constrained", constraintKind: "suffix" };
    case "prefixSuffix":
      return { kind: "constrained", constraintKind: "prefixSuffix" };
    case "charInclusion":
      return {
        kind: "constrained",
        constraintKind: "charInclusion",
        charMust: abstractValue.mustChars,
        charMay: abstractValue.mayChars,
        ...(abstractValue.mayIncludeOtherChars ? { mayIncludeOtherChars: true } : {}),
      };
    case "composite":
    case "top":
      return { kind: "top" };
    default:
      abstractValue satisfies never;
      return { kind: "none" };
  }
}
