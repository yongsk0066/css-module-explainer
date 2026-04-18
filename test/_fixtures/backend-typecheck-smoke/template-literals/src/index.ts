type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "lg";
type ButtonClass = `btn-${Variant}`;
type ChipClass = `chip-${Size}`;
type UiClass = ButtonClass | ChipClass;

const buttonByVariant = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
} as const satisfies Record<Variant, ButtonClass>;

type ResolvedClass<TVariant extends Variant, TSize extends Size> = TSize extends "sm"
  ? (typeof buttonByVariant)[TVariant]
  : `chip-${TSize}`;

function resolveUiClass<TVariant extends Variant, TSize extends Size>(
  variant: TVariant,
  size: TSize,
): ResolvedClass<TVariant, TSize> {
  if (size === "sm") {
    return buttonByVariant[variant] as ResolvedClass<TVariant, TSize>;
  }

  return `chip-${size}` as ResolvedClass<TVariant, TSize>;
}

const rendered = [
  resolveUiClass("primary", "sm"),
  resolveUiClass("secondary", "lg"),
] as const satisfies readonly UiClass[];

void rendered;
