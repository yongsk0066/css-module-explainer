import type { BemSuffixInfo, ComposesRef, Range } from "@css-module-explainer/shared";
import type { HirDocumentBase, HirNodeBase } from "./shared-types";

export interface StyleDocumentHIR extends HirDocumentBase {
  readonly kind: "style";
  readonly selectors: readonly SelectorDeclHIR[];
  readonly keyframes: readonly KeyframesDeclHIR[];
  readonly animationNameRefs: readonly AnimationNameRefHIR[];
}

export type SelectorViewKind = "canonical" | "alias";

export type NestedSelectorSafety = "flat" | "bemSuffixSafe" | "nestedUnsafe";

export interface SelectorDeclHIR extends HirNodeBase {
  readonly kind: "selector";
  readonly range: Range;
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

export interface KeyframesDeclHIR extends HirNodeBase {
  readonly kind: "keyframes";
  readonly range: Range;
  readonly name: string;
  readonly ruleRange: Range;
}

export interface AnimationNameRefHIR extends HirNodeBase {
  readonly kind: "animationNameRef";
  readonly range: Range;
  readonly name: string;
  readonly property: "animation" | "animation-name";
}

export function makeStyleDocumentHIR(
  filePath: string,
  selectors: readonly SelectorDeclHIR[],
  keyframes: readonly KeyframesDeclHIR[] = [],
  animationNameRefs: readonly AnimationNameRefHIR[] = [],
): StyleDocumentHIR {
  return {
    kind: "style",
    filePath,
    selectors,
    keyframes,
    animationNameRefs,
  };
}
