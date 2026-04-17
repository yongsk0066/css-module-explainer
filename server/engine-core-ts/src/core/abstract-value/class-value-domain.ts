export type AbstractClassValue =
  | BottomClassValue
  | ExactClassValue
  | FiniteSetClassValue
  | PrefixClassValue
  | SuffixClassValue
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
  readonly provenance?:
    | "concatUnknownRight"
    | "prefixJoinLcp"
    | "finiteSetWidening"
    | "finiteSetConcatPrefixLcp";
}

export interface SuffixClassValue {
  readonly kind: "suffix";
  readonly suffix: string;
  readonly provenance?: "concatUnknownLeft" | "suffixJoinLcs";
}

export interface TopClassValue {
  readonly kind: "top";
}

export const BOTTOM_CLASS_VALUE: BottomClassValue = { kind: "bottom" };
export const TOP_CLASS_VALUE: TopClassValue = { kind: "top" };
export const MAX_FINITE_CLASS_VALUES = 8;

export function exactClassValue(value: string): ExactClassValue {
  return { kind: "exact", value };
}

export function finiteSetClassValue(values: readonly string[]): AbstractClassValue {
  const normalized = normalizeValues(values);
  if (normalized.length === 0) return BOTTOM_CLASS_VALUE;
  if (normalized.length === 1) return exactClassValue(normalized[0]!);
  if (normalized.length > MAX_FINITE_CLASS_VALUES) {
    const prefix = meaningfulLongestCommonPrefix(normalized);
    return prefix.length > 0 ? prefixClassValue(prefix, "finiteSetWidening") : TOP_CLASS_VALUE;
  }
  return { kind: "finiteSet", values: normalized };
}

export function prefixClassValue(
  prefix: string,
  provenance?: PrefixClassValue["provenance"],
): PrefixClassValue {
  return provenance ? { kind: "prefix", prefix, provenance } : { kind: "prefix", prefix };
}

export function suffixClassValue(
  suffix: string,
  provenance?: SuffixClassValue["provenance"],
): SuffixClassValue {
  return provenance ? { kind: "suffix", suffix, provenance } : { kind: "suffix", suffix };
}

export function concatenateClassValues(
  left: AbstractClassValue,
  right: AbstractClassValue,
): AbstractClassValue {
  if (left.kind === "bottom" || right.kind === "bottom") return BOTTOM_CLASS_VALUE;
  if (left.kind === "top" || right.kind === "top") return TOP_CLASS_VALUE;

  if (left.kind === "prefix") {
    switch (right.kind) {
      case "exact":
      case "finiteSet":
      case "prefix":
        return left;
      case "suffix":
        return TOP_CLASS_VALUE;
      default:
        right satisfies never;
        return TOP_CLASS_VALUE;
    }
  }

  if (right.kind === "suffix") {
    switch (left.kind) {
      case "exact":
      case "finiteSet":
      case "suffix":
        return right;
      default:
        left satisfies never;
        return TOP_CLASS_VALUE;
    }
  }

  if (left.kind === "exact") {
    switch (right.kind) {
      case "exact":
        return exactClassValue(left.value + right.value);
      case "finiteSet":
        return finiteSetClassValue(right.values.map((value) => left.value + value));
      case "prefix":
        return prefixClassValue(left.value + right.prefix);
      default:
        right satisfies never;
        return TOP_CLASS_VALUE;
    }
  }

  if (right.kind === "exact") {
    switch (left.kind) {
      case "finiteSet":
        return finiteSetClassValue(left.values.map((value) => value + right.value));
      case "suffix":
        return right.value.length > 0 ? suffixClassValue(right.value) : left;
      default:
        left satisfies never;
        return TOP_CLASS_VALUE;
    }
  }

  if (left.kind === "suffix") {
    switch (right.kind) {
      case "finiteSet":
        return suffixFromFiniteValues(right.values);
      case "prefix":
        return TOP_CLASS_VALUE;
      default:
        right satisfies never;
        return TOP_CLASS_VALUE;
    }
  }

  if (left.kind === "finiteSet" && right.kind === "prefix") {
    const prefix = meaningfulLongestCommonPrefix(left.values.map((value) => value + right.prefix));
    return prefix.length > 0
      ? prefixClassValue(prefix, "finiteSetConcatPrefixLcp")
      : TOP_CLASS_VALUE;
  }

  if (left.kind === "finiteSet" && right.kind === "finiteSet") {
    return finiteSetClassValue(
      left.values.flatMap((leftValue) => right.values.map((rightValue) => leftValue + rightValue)),
    );
  }

  return TOP_CLASS_VALUE;
}

export function concatenateWithUnknownRight(value: AbstractClassValue): AbstractClassValue {
  switch (value.kind) {
    case "bottom":
      return BOTTOM_CLASS_VALUE;
    case "exact":
      return value.value.length > 0
        ? prefixClassValue(value.value, "concatUnknownRight")
        : TOP_CLASS_VALUE;
    case "finiteSet": {
      const prefix = meaningfulLongestCommonPrefix(value.values);
      return prefix.length > 0 ? prefixClassValue(prefix, "concatUnknownRight") : TOP_CLASS_VALUE;
    }
    case "prefix":
      return value;
    case "suffix":
      return TOP_CLASS_VALUE;
    case "top":
      return TOP_CLASS_VALUE;
    default:
      value satisfies never;
      return TOP_CLASS_VALUE;
  }
}

export function concatenateWithUnknownLeft(value: AbstractClassValue): AbstractClassValue {
  switch (value.kind) {
    case "bottom":
      return BOTTOM_CLASS_VALUE;
    case "exact":
      return value.value.length > 0
        ? suffixClassValue(value.value, "concatUnknownLeft")
        : TOP_CLASS_VALUE;
    case "finiteSet":
      return suffixFromFiniteValues(value.values, "concatUnknownLeft");
    case "prefix":
      return TOP_CLASS_VALUE;
    case "suffix":
      return value;
    case "top":
      return TOP_CLASS_VALUE;
    default:
      value satisfies never;
      return TOP_CLASS_VALUE;
  }
}

export function joinClassValues(
  left: AbstractClassValue,
  right: AbstractClassValue,
): AbstractClassValue {
  if (left.kind === "bottom") return right;
  if (right.kind === "bottom") return left;
  if (left.kind === "top" || right.kind === "top") return TOP_CLASS_VALUE;

  if (left.kind === "prefix" && right.kind === "prefix") {
    if (left.prefix === right.prefix) {
      return left.provenance ? left : right;
    }
    const prefix = meaningfulLongestCommonPrefix([left.prefix, right.prefix]);
    return prefix.length > 0 ? prefixClassValue(prefix, "prefixJoinLcp") : TOP_CLASS_VALUE;
  }

  if (left.kind === "suffix" && right.kind === "suffix") {
    if (left.suffix === right.suffix) {
      return left.provenance ? left : right;
    }
    const suffix = meaningfulLongestCommonSuffix([left.suffix, right.suffix]);
    return suffix.length > 0 ? suffixClassValue(suffix, "suffixJoinLcs") : TOP_CLASS_VALUE;
  }

  if (left.kind === "prefix") {
    switch (right.kind) {
      case "exact":
      case "finiteSet":
        return joinPrefixWithValue(left, right);
      case "suffix":
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
      case "suffix":
        return TOP_CLASS_VALUE;
      default:
        return TOP_CLASS_VALUE;
    }
  }

  if (left.kind === "suffix") {
    switch (right.kind) {
      case "exact":
      case "finiteSet":
        return joinSuffixWithValue(left, right);
      case "suffix":
        return left.provenance ? left : right;
      default:
        return TOP_CLASS_VALUE;
    }
  }

  if (right.kind === "suffix") {
    switch (left.kind) {
      case "exact":
      case "finiteSet":
        return joinSuffixWithValue(right, left);
      default:
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
    case "suffix":
    case "top":
      return null;
    default:
      value satisfies never;
      return null;
  }
}

function joinPrefixWithValue(
  prefixValue: PrefixClassValue,
  other: Exclude<
    AbstractClassValue,
    BottomClassValue | PrefixClassValue | SuffixClassValue | TopClassValue
  >,
): AbstractClassValue {
  const finiteValues = toFiniteValues(other);
  return finiteValues.every((value) => value.startsWith(prefixValue.prefix))
    ? prefixValue
    : TOP_CLASS_VALUE;
}

function joinSuffixWithValue(
  suffixValue: SuffixClassValue,
  other: Exclude<
    AbstractClassValue,
    BottomClassValue | PrefixClassValue | SuffixClassValue | TopClassValue
  >,
): AbstractClassValue {
  const finiteValues = toFiniteValues(other);
  return finiteValues.every((value) => value.endsWith(suffixValue.suffix))
    ? suffixValue
    : TOP_CLASS_VALUE;
}

function toFiniteValues(
  value: Exclude<
    AbstractClassValue,
    BottomClassValue | PrefixClassValue | SuffixClassValue | TopClassValue
  >,
): readonly string[] {
  return value.kind === "exact" ? [value.value] : value.values;
}

function normalizeValues(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).toSorted();
}

function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0]!;
  for (let index = 1; index < values.length && prefix.length > 0; index++) {
    const value = values[index]!;
    let matchLength = 0;
    while (
      matchLength < prefix.length &&
      matchLength < value.length &&
      prefix[matchLength] === value[matchLength]
    ) {
      matchLength++;
    }
    prefix = prefix.slice(0, matchLength);
  }
  return prefix;
}

function meaningfulLongestCommonPrefix(values: readonly string[]): string {
  const prefix = longestCommonPrefix(values);
  if (prefix.length === 0) return "";
  return isMeaningfulClassPrefix(prefix, values) ? prefix : "";
}

function suffixFromFiniteValues(
  values: readonly string[],
  provenance?: SuffixClassValue["provenance"],
): AbstractClassValue {
  const suffix = meaningfulLongestCommonSuffix(values);
  return suffix.length > 0 ? suffixClassValue(suffix, provenance) : TOP_CLASS_VALUE;
}

function longestCommonSuffix(values: readonly string[]): string {
  if (values.length === 0) return "";
  const reversed = values.map((value) => [...value].toReversed().join(""));
  return [...longestCommonPrefix(reversed)].toReversed().join("");
}

function meaningfulLongestCommonSuffix(values: readonly string[]): string {
  const suffix = longestCommonSuffix(values);
  if (suffix.length === 0) return "";
  return isMeaningfulClassSuffix(suffix, values) ? suffix : "";
}

function isMeaningfulClassPrefix(prefix: string, values: readonly string[]): boolean {
  if (prefix.length === 0) return false;
  if (endsAtClassBoundary(prefix)) return true;
  return values.every(
    (value) => value.length === prefix.length || isClassBoundaryChar(value[prefix.length]),
  );
}

function isMeaningfulClassSuffix(suffix: string, values: readonly string[]): boolean {
  if (suffix.length === 0) return false;
  if (startsAtClassBoundary(suffix)) return true;
  return values.every((value) => {
    if (value.length === suffix.length) return true;
    return isClassBoundaryChar(value[value.length - suffix.length - 1]);
  });
}

function endsAtClassBoundary(value: string): boolean {
  const last = value[value.length - 1];
  return isClassBoundaryChar(last);
}

function startsAtClassBoundary(value: string): boolean {
  return isClassBoundaryChar(value[0]);
}

function isClassBoundaryChar(char: string | undefined): boolean {
  return char === "-" || char === "_";
}
