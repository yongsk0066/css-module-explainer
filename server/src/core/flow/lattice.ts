import type { EdgeCertainty } from "../semantic/certainty";

export interface ClassValueLattice {
  readonly values: readonly string[];
  readonly branched: boolean;
}

export interface FlowResolution {
  readonly values: readonly string[];
  readonly certainty: EdgeCertainty;
  readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
}

export function exactValue(value: string): ClassValueLattice {
  return { values: [value], branched: false };
}

export function mergeValues(
  left: ClassValueLattice | null,
  right: ClassValueLattice | null,
): ClassValueLattice | null {
  if (!left) return right;
  if (!right) return left;
  const values = Array.from(new Set([...left.values, ...right.values])).toSorted();
  return {
    values,
    branched:
      left.branched ||
      right.branched ||
      left.values.length !== right.values.length ||
      left.values.some((value, index) => value !== right.values[index]),
  };
}

export function toFlowResolution(value: ClassValueLattice | null): FlowResolution | null {
  if (!value || value.values.length === 0) return null;
  return {
    values: value.values,
    certainty: value.branched || value.values.length > 1 ? "inferred" : "exact",
    reason: value.branched ? "flowBranch" : "flowLiteral",
  };
}
