export type EdgeCertainty = "exact" | "inferred" | "possible";

export function rankCertainty(certainty: EdgeCertainty): number {
  switch (certainty) {
    case "exact":
      return 3;
    case "inferred":
      return 2;
    case "possible":
      return 1;
    default:
      certainty satisfies never;
      return certainty;
  }
}

export function isAtLeastInferred(certainty: EdgeCertainty): boolean {
  return rankCertainty(certainty) >= rankCertainty("inferred");
}
