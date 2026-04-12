import type {
  BemSuffixInfo,
  ComposesRef,
  Range,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import {
  makeStyleDocumentHIR,
  type NestedSelectorSafety,
  type SelectorDeclHIR,
  type StyleDocumentHIR,
} from "../../server/src/core/hir/style-types";
import {
  expandStyleDocumentWithTransform,
  type ClassnameTransformMode,
} from "../../server/src/core/scss/classname-transform";
import { parseStyleDocument } from "../../server/src/core/scss/scss-parser";

export function buildStyleDocumentFromClassMap(
  filePath: string,
  classMap: ScssClassMap,
): StyleDocumentHIR {
  const selectors = Array.from(classMap.values(), toSelectorDecl).toSorted(compareSelectors);
  return makeStyleDocumentHIR(filePath, selectors);
}

export function styleDocumentToLegacyClassMap(doc: StyleDocumentHIR): ScssClassMap {
  return new Map<string, SelectorInfo>(
    doc.selectors.map((selector) => [selector.name, selectorDeclToLegacySelectorInfo(selector)]),
  );
}

export function parseStyleModule(content: string, filePath: string): ScssClassMap {
  return styleDocumentToLegacyClassMap(parseStyleDocument(content, filePath));
}

export function expandClassMapWithTransform(
  base: ScssClassMap,
  mode: ClassnameTransformMode,
): ScssClassMap {
  if (mode === "asIs") return base;
  return styleDocumentToLegacyClassMap(
    expandStyleDocumentWithTransform(
      buildStyleDocumentFromClassMap("/compat.module.scss", base),
      mode,
    ),
  );
}

function selectorDeclToLegacySelectorInfo(selector: SelectorDeclHIR): SelectorInfo {
  return {
    name: selector.name,
    range: selector.range,
    fullSelector: selector.fullSelector,
    declarations: selector.declarations,
    ruleRange: selector.ruleRange,
    ...(selector.composes.length > 0 ? { composes: selector.composes as ComposesRef[] } : {}),
    ...(selector.nestedSafety !== "flat" ? { isNested: true as const } : {}),
    ...(selector.bemSuffix ? { bemSuffix: selector.bemSuffix as BemSuffixInfo } : {}),
    ...(selector.originalName ? { originalName: selector.originalName } : {}),
  };
}

function toSelectorDecl(info: SelectorInfo, index: number): SelectorDeclHIR {
  return {
    kind: "selector",
    id: `selector:${index}`,
    name: info.name,
    canonicalName: info.originalName ?? info.name,
    viewKind: info.originalName ? "alias" : "canonical",
    range: info.range as Range,
    fullSelector: info.fullSelector,
    declarations: info.declarations,
    ruleRange: info.ruleRange as Range,
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
