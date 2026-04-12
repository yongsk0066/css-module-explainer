import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { canonicalNameOf } from "../../scss/classname-transform";
import {
  makeStyleDocumentHIR,
  type NestedSelectorSafety,
  type SelectorDeclHIR,
  type StyleDocumentHIR,
} from "../style-types";

export function buildStyleDocumentFromClassMap(
  filePath: string,
  classMap: ScssClassMap,
): StyleDocumentHIR {
  const selectors = Array.from(classMap.values(), toSelectorDecl).toSorted(compareSelectors);
  return makeStyleDocumentHIR(filePath, selectors);
}

function toSelectorDecl(info: SelectorInfo, index: number): SelectorDeclHIR {
  return {
    kind: "selector",
    id: `selector:${index}`,
    name: info.name,
    canonicalName: canonicalNameOf(info),
    viewKind: info.originalName ? "alias" : "canonical",
    range: info.range,
    fullSelector: info.fullSelector,
    declarations: info.declarations,
    ruleRange: info.ruleRange,
    composes: info.composes ?? [],
    nestedSafety: classifyNestedSafety(info),
    ...(info.bemSuffix ? { bemSuffix: info.bemSuffix } : {}),
    ...(info.originalName ? { originalName: info.originalName } : {}),
  };
}

function classifyNestedSafety(info: SelectorInfo): NestedSelectorSafety {
  if (info.bemSuffix) return "bemSuffixSafe";
  if (info.isNested) return "nestedUnsafe";
  return "flat";
}

function compareSelectors(a: SelectorDeclHIR, b: SelectorDeclHIR): number {
  const line = a.range.start.line - b.range.start.line;
  if (line !== 0) return line;
  const character = a.range.start.character - b.range.start.character;
  if (character !== 0) return character;
  return a.name.localeCompare(b.name);
}
