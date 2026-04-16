import type { CheckerFinding } from "./contracts";

export type CheckerCodeBundle = "source-missing" | "style-recovery" | "style-unused";

const CHECKER_CODE_BUNDLES: Record<CheckerCodeBundle, readonly CheckerFinding["code"][]> = {
  "source-missing": [
    "missing-module",
    "missing-static-class",
    "missing-template-prefix",
    "missing-resolved-class-values",
    "missing-resolved-class-domain",
  ],
  "style-recovery": [
    "missing-composed-module",
    "missing-composed-selector",
    "missing-value-module",
    "missing-imported-value",
    "missing-keyframes",
  ],
  "style-unused": ["unused-selector"],
};

export function isCheckerCodeBundle(value: string): value is CheckerCodeBundle {
  return value in CHECKER_CODE_BUNDLES;
}

export function expandCheckerCodeBundles(
  bundles: readonly CheckerCodeBundle[],
  includeCodes: readonly string[],
): readonly string[] {
  return [
    ...new Set([...includeCodes, ...bundles.flatMap((bundle) => CHECKER_CODE_BUNDLES[bundle])]),
  ];
}
