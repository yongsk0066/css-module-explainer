export type Kind = "chip" | "panel";
export type Variant = "neutral" | "brand";
export type TokenClass = `${Kind}-${Variant}`;

export const CLASS_BY_KIND = {
  chip: "chip",
  panel: "panel",
} as const satisfies Record<Kind, Kind>;
