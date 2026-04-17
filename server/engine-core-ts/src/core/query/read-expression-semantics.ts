import type { ClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import type { FlowResolution } from "../flow/lattice";
import type { EdgeCertainty } from "../semantic/certainty";
import type {
  ReadSourceExpressionResolutionContext,
  ReadSourceExpressionResolutionEnv,
} from "./read-source-expression-resolution";
import { readSourceExpressionResolution } from "./read-source-expression-resolution";

export type ExpressionValueDomainKind = "none" | "exact" | "finiteSet" | "prefix" | "top";

export interface ExpressionSemanticsSummary {
  readonly expression: ClassExpressionHIR;
  readonly styleDocument: StyleDocumentHIR | null;
  readonly selectors: readonly SelectorDeclHIR[];
  readonly selectorNames: readonly string[];
  readonly candidateNames: readonly string[];
  readonly finiteValues: readonly string[] | null;
  readonly valueDomainKind: ExpressionValueDomainKind;
  readonly abstractValue?: FlowResolution["abstractValue"];
  readonly valueCertainty?: EdgeCertainty;
  readonly selectorCertainty: EdgeCertainty;
  readonly reason?: FlowResolution["reason"];
}

export function readExpressionSemantics(
  ctx: ReadSourceExpressionResolutionContext,
  env: ReadSourceExpressionResolutionEnv,
): ExpressionSemanticsSummary {
  const resolution = readSourceExpressionResolution(ctx, env);
  const selectorNames = resolution.selectors.map((selector) => selector.name);
  return {
    expression: ctx.expression,
    styleDocument: resolution.styleDocument,
    selectors: resolution.selectors,
    selectorNames,
    candidateNames: candidateNamesForResolution(resolution),
    finiteValues: resolution.finiteValues,
    valueDomainKind: classifyValueDomain(resolution.abstractValue),
    ...(resolution.abstractValue ? { abstractValue: resolution.abstractValue } : {}),
    ...(resolution.valueCertainty ? { valueCertainty: resolution.valueCertainty } : {}),
    ...(resolution.reason ? { reason: resolution.reason } : {}),
    selectorCertainty: resolution.selectorCertainty,
  };
}

function candidateNamesForResolution(
  resolution: ReturnType<typeof readSourceExpressionResolution>,
): readonly string[] {
  if (resolution.finiteValues && resolution.finiteValues.length > 0) {
    return resolution.finiteValues;
  }
  return resolution.selectors.map((selector) => selector.name);
}

function classifyValueDomain(
  abstractValue?: FlowResolution["abstractValue"],
): ExpressionValueDomainKind {
  if (!abstractValue) return "none";
  switch (abstractValue.kind) {
    case "bottom":
      return "none";
    case "exact":
      return "exact";
    case "finiteSet":
      return "finiteSet";
    case "prefix":
      return "prefix";
    case "suffix":
    case "prefixSuffix":
    case "charInclusion":
      return "top";
    case "top":
      return "top";
    default:
      abstractValue satisfies never;
      return "none";
  }
}
