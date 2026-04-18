import { CLASS_BY_KIND, type Kind, type TokenClass } from "#tokens/classes";

type Variant = "neutral" | "brand";
type ClassName<TKind extends Kind, TVariant extends Variant> = `${TKind}-${TVariant}`;

function resolveTokenClass<TKind extends Kind, TVariant extends Variant>(
  kind: TKind,
  variant: TVariant,
): ClassName<TKind, TVariant> {
  const prefix = CLASS_BY_KIND[kind];
  return `${prefix}-${variant}` as ClassName<TKind, TVariant>;
}

const rows = [
  resolveTokenClass("chip", "neutral"),
  resolveTokenClass("panel", "brand"),
] as const satisfies readonly TokenClass[];

void rows;
