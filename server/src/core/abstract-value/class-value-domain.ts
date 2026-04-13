export type AbstractClassValue =
  | BottomClassValue
  | ExactClassValue
  | FiniteSetClassValue
  | PrefixClassValue
  | TopClassValue;

export interface BottomClassValue {
  readonly kind: "bottom";
}

export interface ExactClassValue {
  readonly kind: "exact";
  readonly value: string;
}

export interface FiniteSetClassValue {
  readonly kind: "finiteSet";
  readonly values: readonly string[];
}

export interface PrefixClassValue {
  readonly kind: "prefix";
  readonly prefix: string;
}

export interface TopClassValue {
  readonly kind: "top";
}

export const BOTTOM_CLASS_VALUE: BottomClassValue = { kind: "bottom" };
export const TOP_CLASS_VALUE: TopClassValue = { kind: "top" };

export function exactClassValue(value: string): ExactClassValue {
  return { kind: "exact", value };
}

export function finiteSetClassValue(values: readonly string[]): AbstractClassValue {
  const normalized = normalizeValues(values);
  if (normalized.length === 0) return BOTTOM_CLASS_VALUE;
  if (normalized.length === 1) return exactClassValue(normalized[0]!);
  return { kind: "finiteSet", values: normalized };
}

export function prefixClassValue(prefix: string): PrefixClassValue {
  return { kind: "prefix", prefix };
}

export function joinClassValues(
  left: AbstractClassValue,
  right: AbstractClassValue,
): AbstractClassValue {
  if (left.kind === "bottom") return right;
  if (right.kind === "bottom") return left;
  if (left.kind === "top" || right.kind === "top") return TOP_CLASS_VALUE;

  if (left.kind === "prefix" && right.kind === "prefix") {
    return left.prefix === right.prefix ? left : TOP_CLASS_VALUE;
  }

  if (left.kind === "prefix") {
    switch (right.kind) {
      case "exact":
      case "finiteSet":
        return joinPrefixWithValue(left, right);
      case "prefix":
        return TOP_CLASS_VALUE;
      default:
        right satisfies never;
        return TOP_CLASS_VALUE;
    }
  }

  if (right.kind === "prefix") {
    switch (left.kind) {
      case "exact":
      case "finiteSet":
        return joinPrefixWithValue(right, left);
      default:
        left satisfies never;
        return TOP_CLASS_VALUE;
    }
  }

  return finiteSetClassValue([...toFiniteValues(left), ...toFiniteValues(right)]);
}

export function enumerateFiniteClassValues(value: AbstractClassValue): readonly string[] | null {
  switch (value.kind) {
    case "bottom":
      return [];
    case "exact":
      return [value.value];
    case "finiteSet":
      return value.values;
    case "prefix":
    case "top":
      return null;
    default:
      value satisfies never;
      return null;
  }
}

function joinPrefixWithValue(
  prefixValue: PrefixClassValue,
  other: Exclude<AbstractClassValue, BottomClassValue | PrefixClassValue | TopClassValue>,
): AbstractClassValue {
  const finiteValues = toFiniteValues(other);
  return finiteValues.every((value) => value.startsWith(prefixValue.prefix))
    ? prefixValue
    : TOP_CLASS_VALUE;
}

function toFiniteValues(
  value: Exclude<AbstractClassValue, BottomClassValue | PrefixClassValue | TopClassValue>,
): readonly string[] {
  return value.kind === "exact" ? [value.value] : value.values;
}

function normalizeValues(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).toSorted();
}
