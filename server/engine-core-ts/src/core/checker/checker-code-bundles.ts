import type { CheckerFinding } from "./contracts";

export type CheckerCodeBundle = "ci-default" | "source-missing" | "style-recovery" | "style-unused";

const CHECKER_CODE_BUNDLES: Record<CheckerCodeBundle, readonly CheckerFinding["code"][]> = {
  "ci-default": [
    "missing-module",
    "missing-static-class",
    "missing-template-prefix",
    "missing-resolved-class-values",
    "missing-resolved-class-domain",
    "missing-composed-module",
    "missing-composed-selector",
    "missing-value-module",
    "missing-imported-value",
    "missing-keyframes",
    "missing-sass-symbol",
  ],
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
    "missing-sass-symbol",
  ],
  "style-unused": ["unused-selector"],
};

export function isCheckerCodeBundle(value: string): value is CheckerCodeBundle {
  return value in CHECKER_CODE_BUNDLES;
}

export function listCheckerCodeBundles(): readonly {
  readonly bundle: CheckerCodeBundle;
  readonly codes: readonly CheckerFinding["code"][];
}[] {
  return (Object.keys(CHECKER_CODE_BUNDLES) as CheckerCodeBundle[]).map((bundle) => ({
    bundle,
    codes: CHECKER_CODE_BUNDLES[bundle],
  }));
}

export function expandCheckerCodeBundles(
  bundles: readonly CheckerCodeBundle[],
  includeCodes: readonly string[],
): readonly string[] {
  return [
    ...new Set([...includeCodes, ...bundles.flatMap((bundle) => CHECKER_CODE_BUNDLES[bundle])]),
  ];
}
