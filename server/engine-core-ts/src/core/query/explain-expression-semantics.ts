import type { ClassExpressionHIR } from "../hir/source-types";
import type { FlowResolution } from "../flow/lattice";
import {
  deriveSelectorCertaintyProfile,
  deriveValueCertaintyProfile,
  type EdgeCertainty,
} from "../semantic/certainty";
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
  readonly valueCertaintyShapeLabel?: string;
  readonly valueCertaintyReasonLabel?: string;
  readonly selectorCertainty?: EdgeCertainty;
  readonly selectorCertaintyShapeLabel?: string;
  readonly selectorCertaintyReasonLabel?: string;
  readonly reasonLabel?: string;
}

export interface InvalidClassAnalysisMetadata {
  readonly analysisReason?: string;
  readonly valueCertaintyShapeLabel?: string;
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
      const valueCertaintyProfile = deriveValueCertaintyProfile(
        semantics.abstractValue,
        semantics.valueCertainty,
      );
      const valueCertaintyReasonLabel = describeValueCertaintyReason(
        semantics.abstractValue,
        semantics.valueCertainty,
        semantics.reason,
      );
      const selectorCertaintyProfile = deriveSelectorCertaintyProfile(
        semantics.selectors.length,
        semantics.selectorCertainty,
        semantics.abstractValue,
      );
      const selectorCertaintyReasonLabel = describeSelectorCertaintyReason(
        semantics.abstractValue,
        semantics.selectorCertainty,
        semantics.selectors.length,
      );
      const reasonLabel = describeResolutionReason(semantics.reason);
      return {
        kind: "symbolRef",
        subject: expression.rawReference,
        candidates: semantics.candidateNames,
        ...(valueDomainLabel ? { valueDomainLabel } : {}),
        ...(valueDomainReasonLabel ? { valueDomainReasonLabel } : {}),
        ...(semantics.valueCertainty ? { valueCertainty: semantics.valueCertainty } : {}),
        ...(valueCertaintyProfile
          ? { valueCertaintyShapeLabel: valueCertaintyProfile.shapeLabel }
          : {}),
        ...(valueCertaintyReasonLabel ? { valueCertaintyReasonLabel } : {}),
        ...(semantics.selectorCertainty ? { selectorCertainty: semantics.selectorCertainty } : {}),
        ...(selectorCertaintyProfile
          ? { selectorCertaintyShapeLabel: selectorCertaintyProfile.shapeLabel }
          : {}),
        ...(selectorCertaintyReasonLabel ? { selectorCertaintyReasonLabel } : {}),
        ...(reasonLabel ? { reasonLabel } : {}),
      };
    }
    case "template": {
      if (semantics.selectors.length === 0) return null;
      const valueDomainLabel = describeAbstractValue(semantics.abstractValue);
      const valueDomainReasonLabel = describeAbstractValueReason(semantics.abstractValue);
      const selectorCertaintyProfile = deriveSelectorCertaintyProfile(
        semantics.selectors.length,
        semantics.selectorCertainty,
        semantics.abstractValue,
      );
      const selectorCertaintyReasonLabel = describeSelectorCertaintyReason(
        semantics.abstractValue,
        semantics.selectorCertainty,
        semantics.selectors.length,
      );
      return {
        kind: "template",
        subject: expression.staticPrefix,
        candidates: semantics.candidateNames,
        ...(valueDomainLabel ? { valueDomainLabel } : {}),
        ...(valueDomainReasonLabel ? { valueDomainReasonLabel } : {}),
        ...(semantics.selectorCertainty ? { selectorCertainty: semantics.selectorCertainty } : {}),
        ...(selectorCertaintyProfile
          ? { selectorCertaintyShapeLabel: selectorCertaintyProfile.shapeLabel }
          : {}),
        ...(selectorCertaintyReasonLabel ? { selectorCertaintyReasonLabel } : {}),
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
        return withAnalysisReason(
          `Missing class for union member${finding.missingValues.length > 1 ? "s" : ""}: ${finding.missingValues.map((value) => `'${value}'`).join(", ")}.`,
          finding,
        );
      }
      if (finding.missingValues.length === 1 && finding.valueCertainty === "exact") {
        return withAnalysisReason(
          `Missing class for resolved value: '${finding.missingValues[0]}'.`,
          finding,
        );
      }
      return withAnalysisReason(
        `Missing class for possible value${finding.missingValues.length > 1 ? "s" : ""}: ${finding.missingValues.map((value) => `'${value}'`).join(", ")}.`,
        finding,
      );
    case "missingResolvedClassDomain":
      switch (finding.abstractValue.kind) {
        case "prefix":
          return withAnalysisReason(
            `No class matched resolved prefix '${finding.abstractValue.prefix}'.`,
            finding,
          );
        case "top":
          return withAnalysisReason(
            "Dynamic class value could not be matched to any known selector.",
            finding,
          );
        default:
          return withAnalysisReason(
            "Resolved dynamic class domain did not match any known selector.",
            finding,
          );
      }
    default:
      finding satisfies never;
      return "";
  }
}

function withAnalysisReason(
  message: string,
  finding: Extract<
    InvalidClassReferenceFinding,
    { kind: "missingResolvedClassValues" | "missingResolvedClassDomain" }
  >,
): string {
  const metadata = buildInvalidClassAnalysisMetadata(
    finding.abstractValue,
    finding.valueCertainty,
    finding.reason,
  );
  const parts = [message];
  if (metadata.analysisReason) {
    parts.push(`Analysis reason: ${metadata.analysisReason}.`);
  }
  if (metadata.valueCertaintyShapeLabel) {
    parts.push(`Analysis shape: ${metadata.valueCertaintyShapeLabel}.`);
  }
  return parts.join(" ");
}

export function buildInvalidClassAnalysisMetadata(
  abstractValue: FlowResolution["abstractValue"] | undefined,
  valueCertainty: EdgeCertainty | undefined,
  reason: FlowResolution["reason"] | undefined,
): InvalidClassAnalysisMetadata {
  const reasons = [
    describeValueCertaintyReason(abstractValue, valueCertainty, reason),
    describeAbstractValueReason(abstractValue),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const uniqueReasons = Array.from(new Set(reasons));
  const valueCertaintyProfile = deriveValueCertaintyProfile(abstractValue, valueCertainty);
  return {
    ...(uniqueReasons.length > 0 ? { analysisReason: uniqueReasons.join("; ") } : {}),
    ...(valueCertaintyProfile
      ? { valueCertaintyShapeLabel: valueCertaintyProfile.shapeLabel }
      : {}),
  };
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

export function describeValueCertaintyReason(
  abstractValue: FlowResolution["abstractValue"] | undefined,
  valueCertainty: EdgeCertainty | undefined,
  reason: FlowResolution["reason"] | undefined,
): string | null {
  if (!abstractValue || !valueCertainty) return null;

  switch (valueCertainty) {
    case "exact":
      return null;
    case "inferred":
      switch (abstractValue.kind) {
        case "finiteSet":
          return reason === "typeUnion"
            ? "TypeScript exposed multiple string-literal candidates"
            : "analysis preserved multiple finite candidate values";
        case "prefix":
          return (
            describeAbstractValueReason(abstractValue) ??
            "analysis preserved only a constrained prefix of the runtime value"
          );
        case "exact":
        case "bottom":
        case "top":
          return null;
        default:
          abstractValue satisfies never;
          return null;
      }
    case "possible":
      return abstractValue.kind === "top"
        ? "analysis lost finite shape information for this value"
        : "analysis could not narrow this value to a finite selector set";
    default:
      valueCertainty satisfies never;
      return null;
  }
}

export function describeSelectorCertaintyReason(
  abstractValue: FlowResolution["abstractValue"] | undefined,
  selectorCertainty: EdgeCertainty | undefined,
  matchedSelectorCount: number,
): string | null {
  if (!selectorCertainty) return null;

  switch (selectorCertainty) {
    case "exact":
      return null;
    case "inferred":
      if (abstractValue?.kind === "prefix") {
        return (
          describeAbstractValueReason(abstractValue) ??
          "constrained prefix matched a bounded selector set"
        );
      }
      return "finite candidate values matched a bounded selector set";
    case "possible":
      return matchedSelectorCount === 0
        ? "no selector could be proven for this value"
        : "analysis could not prove an exact selector set";
    default:
      selectorCertainty satisfies never;
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
