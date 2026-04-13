import {
  enumerateFiniteClassValues,
  exactClassValue as exactAbstractClassValue,
  finiteSetClassValue,
  joinClassValues,
  type AbstractClassValue,
} from "../abstract-value/class-value-domain";
import type { EdgeCertainty } from "../semantic/certainty";

export interface ClassValueLattice {
  readonly abstractValue: AbstractClassValue;
  readonly reason: "flowLiteral" | "flowBranch";
}

export interface FlowResolution {
  readonly values: readonly string[];
  readonly certainty: EdgeCertainty;
  readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
}

export function exactValue(value: string): ClassValueLattice {
  return { abstractValue: exactAbstractClassValue(value), reason: "flowLiteral" };
}

export function mergeValues(
  left: ClassValueLattice | null,
  right: ClassValueLattice | null,
): ClassValueLattice | null {
  if (!left) return right;
  if (!right) return left;
  const abstractValue = joinClassValues(left.abstractValue, right.abstractValue);
  const reason =
    left.reason === "flowBranch" ||
    right.reason === "flowBranch" ||
    !sameAbstractValue(left.abstractValue, right.abstractValue)
      ? "flowBranch"
      : "flowLiteral";
  return {
    abstractValue,
    reason,
  };
}

export function markBranched(value: ClassValueLattice | null): ClassValueLattice | null {
  if (!value || value.reason === "flowBranch") return value;
  return { ...value, reason: "flowBranch" };
}

export function toFlowResolution(value: ClassValueLattice | null): FlowResolution | null {
  if (!value) return null;
  const values = enumerateFiniteClassValues(value.abstractValue);
  if (!values || values.length === 0) return null;
  return {
    values,
    certainty: value.abstractValue.kind === "exact" ? "exact" : "inferred",
    reason: value.reason,
  };
}

export function typeUnionResolution(values: readonly string[]): FlowResolution | null {
  const abstractValue = finiteSetClassValue(values);
  const finiteValues = enumerateFiniteClassValues(abstractValue);
  if (!finiteValues || finiteValues.length === 0) return null;
  return {
    values: finiteValues,
    certainty: abstractValue.kind === "exact" ? "exact" : "inferred",
    reason: "typeUnion",
  };
}

function sameAbstractValue(left: AbstractClassValue, right: AbstractClassValue): boolean {
  if (left.kind === "bottom" && right.kind === "bottom") return true;
  if (left.kind === "top" && right.kind === "top") return true;
  if (left.kind === "exact" && right.kind === "exact") return left.value === right.value;
  if (left.kind === "prefix" && right.kind === "prefix") return left.prefix === right.prefix;
  if (left.kind === "finiteSet" && right.kind === "finiteSet") {
    return left.values.length === right.values.length
      ? left.values.every((value, index) => value === right.values[index])
      : false;
  }
  return false;
}
