import type { BemSuffixInfo, ComposesRef, Range } from "@css-module-explainer/shared";
import type { HirDocumentBase, HirNodeBase } from "./shared-types";

export interface StyleDocumentHIR extends HirDocumentBase {
  readonly kind: "style";
  readonly selectors: readonly SelectorDeclHIR[];
  readonly keyframes: readonly KeyframesDeclHIR[];
  readonly animationNameRefs: readonly AnimationNameRefHIR[];
  readonly valueDecls: readonly ValueDeclHIR[];
  readonly valueImports: readonly ValueImportHIR[];
  readonly valueRefs: readonly ValueRefHIR[];
  readonly sassSymbols: readonly SassSymbolOccurrenceHIR[];
  readonly sassSymbolDecls: readonly SassSymbolDeclHIR[];
}

export type SelectorViewKind = "canonical" | "alias";

export type NestedSelectorSafety = "flat" | "bemSuffixSafe" | "nestedUnsafe";

export type SassSymbolKind = "variable" | "mixin" | "function";

export type SassSymbolRole = "reference" | "include" | "call";

export type SassSymbolResolution = "resolved" | "unresolved";

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

export interface ValueDeclHIR extends HirNodeBase {
  readonly kind: "valueDecl";
  readonly range: Range;
  readonly name: string;
  readonly value: string;
  readonly ruleRange: Range;
}

export interface ValueImportHIR extends HirNodeBase {
  readonly kind: "valueImport";
  readonly range: Range;
  readonly name: string;
  readonly importedName: string;
  readonly from: string;
  readonly ruleRange: Range;
}

export interface ValueRefHIR extends HirNodeBase {
  readonly kind: "valueRef";
  readonly range: Range;
  readonly name: string;
  readonly source: "declaration" | "valueDecl";
}

export interface SassSymbolOccurrenceHIR extends HirNodeBase {
  readonly kind: "sassSymbol";
  readonly selectorName: string;
  readonly symbolKind: SassSymbolKind;
  readonly name: string;
  readonly role: SassSymbolRole;
  readonly resolution: SassSymbolResolution;
  readonly range: Range;
  readonly ruleRange: Range;
}

export interface SassSymbolDeclHIR extends HirNodeBase {
  readonly kind: "sassSymbolDecl";
  readonly symbolKind: SassSymbolKind;
  readonly name: string;
  readonly range: Range;
  readonly ruleRange: Range;
}

export function makeStyleDocumentHIR(
  filePath: string,
  selectors: readonly SelectorDeclHIR[],
  keyframes: readonly KeyframesDeclHIR[] = [],
  animationNameRefs: readonly AnimationNameRefHIR[] = [],
  valueDecls: readonly ValueDeclHIR[] = [],
  valueImports: readonly ValueImportHIR[] = [],
  valueRefs: readonly ValueRefHIR[] = [],
  sassSymbols: readonly SassSymbolOccurrenceHIR[] = [],
  sassSymbolDecls: readonly SassSymbolDeclHIR[] = [],
): StyleDocumentHIR {
  return {
    kind: "style",
    filePath,
    selectors,
    keyframes,
    animationNameRefs,
    valueDecls,
    valueImports,
    valueRefs,
    sassSymbols,
    sassSymbolDecls,
  };
}
