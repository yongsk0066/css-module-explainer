import type { ClassExpressionHIR } from "../hir/source-types";
import type { FlowResolution } from "../flow/lattice";
import type { EdgeCertainty } from "../semantic/certainty";
import type { ExpressionSemanticsSummary } from "./read-expression-semantics";
import type { InvalidClassReferenceFinding } from "./find-invalid-class-references";

type PrefixProvenance = Extract<FlowResolution["abstractValue"], { kind: "prefix" }>["provenance"];

export interface DynamicExpressionExplanation {
  readonly kind: "symbolRef" | "template";
  readonly subject: string;
  readonly candidates: readonly string[];
  readonly valueDomainLabel?: string;
  readonly valueDomainReasonLabel?: string;
  readonly valueCertainty?: EdgeCertainty;
  readonly selectorCertainty?: EdgeCertainty;
  readonly reasonLabel?: string;
}

export function buildDynamicExpressionExplanation(
  expression: ClassExpressionHIR,
  semantics: ExpressionSemanticsSummary,
): DynamicExpressionExplanation | null {
  switch (expression.kind) {
    case "symbolRef": {
      if (!semantics.abstractValue || !semantics.reason) return null;
      const valueDomainLabel = describeAbstractValue(semantics.abstractValue);
      const valueDomainReasonLabel = describeAbstractValueReason(semantics.abstractValue);
      const reasonLabel = describeResolutionReason(semantics.reason);
      return {
        kind: "symbolRef",
        subject: expression.rawReference,
        candidates: semantics.candidateNames,
        ...(valueDomainLabel ? { valueDomainLabel } : {}),
        ...(valueDomainReasonLabel ? { valueDomainReasonLabel } : {}),
        ...(semantics.valueCertainty ? { valueCertainty: semantics.valueCertainty } : {}),
        ...(semantics.selectorCertainty ? { selectorCertainty: semantics.selectorCertainty } : {}),
        ...(reasonLabel ? { reasonLabel } : {}),
      };
    }
    case "template": {
      if (semantics.selectors.length === 0) return null;
      const valueDomainLabel = describeAbstractValue(semantics.abstractValue);
      const valueDomainReasonLabel = describeAbstractValueReason(semantics.abstractValue);
      return {
        kind: "template",
        subject: expression.staticPrefix,
        candidates: semantics.candidateNames,
        ...(valueDomainLabel ? { valueDomainLabel } : {}),
        ...(valueDomainReasonLabel ? { valueDomainReasonLabel } : {}),
        ...(semantics.selectorCertainty ? { selectorCertainty: semantics.selectorCertainty } : {}),
      };
    }
    case "literal":
    case "styleAccess":
      return null;
    default:
      expression satisfies never;
      return null;
  }
}

export function messageForInvalidClassFinding(finding: InvalidClassReferenceFinding): string {
  switch (finding.kind) {
    case "missingStaticClass":
    case "missingTemplatePrefix":
      return "";
    case "missingResolvedClassValues":
      if (finding.reason === "typeUnion") {
        return `Missing class for union member${finding.missingValues.length > 1 ? "s" : ""}: ${finding.missingValues.map((value) => `'${value}'`).join(", ")}.`;
      }
      if (finding.missingValues.length === 1 && finding.valueCertainty === "exact") {
        return `Missing class for resolved value: '${finding.missingValues[0]}'.`;
      }
      return `Missing class for possible value${finding.missingValues.length > 1 ? "s" : ""}: ${finding.missingValues.map((value) => `'${value}'`).join(", ")}.`;
    case "missingResolvedClassDomain":
      switch (finding.abstractValue.kind) {
        case "prefix":
          return `No class matched resolved prefix '${finding.abstractValue.prefix}'.`;
        case "top":
          return "Dynamic class value could not be matched to any known selector.";
        default:
          return "Resolved dynamic class domain did not match any known selector.";
      }
    default:
      finding satisfies never;
      return "";
  }
}

export function describeAbstractValue(
  abstractValue?: FlowResolution["abstractValue"],
): string | null {
  if (!abstractValue) return null;

  switch (abstractValue.kind) {
    case "bottom":
      return "empty";
    case "exact":
      return `exact \`${abstractValue.value}\``;
    case "finiteSet":
      return abstractValue.values.length > 1 ? `finite set (${abstractValue.values.length})` : null;
    case "prefix":
      return isWidenedPrefix(abstractValue.provenance)
        ? `prefix \`${abstractValue.prefix}\` (widened)`
        : `prefix \`${abstractValue.prefix}\``;
    case "top":
      return "unknown";
    default:
      abstractValue satisfies never;
      return null;
  }
}

export function describeAbstractValueReason(
  abstractValue?: FlowResolution["abstractValue"],
): string | null {
  if (!abstractValue || abstractValue.kind !== "prefix") return null;

  switch (abstractValue.provenance) {
    case "concatUnknownRight":
      return "known prefix preserved while concatenating an unknown suffix";
    case "prefixJoinLcp":
      return "branched prefixes merged at their longest common prefix";
    case "finiteSetWidening":
      return "finite candidates widened to a shared prefix";
    case "finiteSetConcatPrefixLcp":
      return "finite candidates concatenated with a prefix and reduced to their shared prefix";
    case undefined:
      return null;
    default:
      abstractValue.provenance satisfies never;
      return null;
  }
}

function isWidenedPrefix(provenance: PrefixProvenance): boolean {
  return provenance === "finiteSetWidening" || provenance === "finiteSetConcatPrefixLcp";
}

export function describeResolutionReason(reason?: FlowResolution["reason"]): string | null {
  if (!reason) return null;
  switch (reason) {
    case "flowLiteral":
      return "local flow analysis";
    case "flowBranch":
      return "branched local flow analysis";
    case "typeUnion":
      return "TypeScript string-literal union analysis";
    default:
      reason satisfies never;
      return null;
  }
}
