import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../style-types";

export function selectorDeclToLegacySelectorInfo(selector: SelectorDeclHIR): SelectorInfo {
  return {
    name: selector.name,
    range: selector.range,
    fullSelector: selector.fullSelector,
    declarations: selector.declarations,
    ruleRange: selector.ruleRange,
    ...(selector.composes.length > 0 ? { composes: selector.composes } : {}),
    ...(selector.nestedSafety !== "flat" ? { isNested: true } : {}),
    ...(selector.bemSuffix ? { bemSuffix: selector.bemSuffix } : {}),
    ...(selector.originalName ? { originalName: selector.originalName } : {}),
  };
}

export function styleDocumentToLegacyClassMap(doc: StyleDocumentHIR): ScssClassMap {
  return new Map<string, SelectorInfo>(
    doc.selectors.map((selector) => [selector.name, selectorDeclToLegacySelectorInfo(selector)]),
  );
}
