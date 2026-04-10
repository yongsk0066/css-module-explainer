import type { CxBinding, StylePropertyRef } from "@css-module-explainer/shared";

/**
 * Build a synthetic CxBinding from a StylePropertyRef.
 *
 * Satisfies the CallSite.binding field for direct `styles.x`
 * references -- acknowledged tech debt until CallSite.binding
 * is replaced with CallSite.scssModulePath.
 */
export function syntheticBindingFromRef(
  ref: Pick<StylePropertyRef, "stylesVarName" | "scssModulePath">,
): CxBinding {
  return {
    cxVarName: ref.stylesVarName,
    stylesVarName: ref.stylesVarName,
    scssModulePath: ref.scssModulePath,
    classNamesImportName: "",
    scope: { startLine: 0, endLine: Number.MAX_SAFE_INTEGER },
  };
}
