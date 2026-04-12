import type { BemSuffixInfo, ComposesRef, Range } from "@css-module-explainer/shared";
import type { HirDocumentBase, HirNodeBase } from "./shared-types";

export interface StyleDocumentHIR extends HirDocumentBase {
  readonly kind: "style";
  readonly selectors: readonly SelectorDeclHIR[];
}

export type SelectorViewKind = "canonical" | "alias";

export type NestedSelectorSafety = "flat" | "bemSuffixSafe" | "nestedUnsafe";

export interface SelectorDeclHIR extends HirNodeBase {
  readonly kind: "selector";
  readonly name: string;
  readonly canonicalName: string;
  readonly viewKind: SelectorViewKind;
  readonly fullSelector: string;
  readonly declarations: string;
  readonly ruleRange: Range;
  readonly composes: readonly ComposesRef[];
  readonly nestedSafety: NestedSelectorSafety;
  readonly bemSuffix?: BemSuffixInfo;
  readonly originalName?: string;
}

export function makeStyleDocumentHIR(
  filePath: string,
  selectors: readonly SelectorDeclHIR[],
): StyleDocumentHIR {
  return {
    kind: "style",
    filePath,
    selectors,
  };
}
