import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import { deriveSelectorProjectionCertainty, type EdgeCertainty } from "../semantic/certainty";
import type { AbstractClassValue } from "./class-value-domain";

export interface AbstractSelectorProjection {
  readonly selectors: readonly SelectorDeclHIR[];
  readonly certainty: EdgeCertainty;
}

export function projectAbstractValueSelectors(
  value: AbstractClassValue,
  styleDocument: StyleDocumentHIR,
): AbstractSelectorProjection {
  const selectors = resolveAbstractValueSelectors(value, styleDocument);
  return {
    selectors,
    certainty: deriveSelectorProjectionCertainty(
      value,
      selectors.length,
      countCanonicalSelectors(styleDocument),
    ),
  };
}

export function resolveAbstractValueSelectors(
  value: AbstractClassValue,
  styleDocument: StyleDocumentHIR,
): readonly SelectorDeclHIR[] {
  switch (value.kind) {
    case "bottom":
      return [];
    case "exact":
      return findCanonicalSelectors(styleDocument, value.value);
    case "finiteSet":
      return uniqueSelectorsById(
        value.values.flatMap((candidate) => findCanonicalSelectors(styleDocument, candidate)),
      );
    case "prefix":
      return findCanonicalSelectorsByPrefix(styleDocument, value.prefix);
    case "suffix":
      return findCanonicalSelectorsBySuffix(styleDocument, value.suffix);
    case "prefixSuffix":
      return findCanonicalSelectorsByPrefixSuffix(styleDocument, value.prefix, value.suffix);
    case "charInclusion":
      return findCanonicalSelectorsByCharInclusion(
        styleDocument,
        value.mustChars,
        value.mayChars,
        Boolean(value.mayIncludeOtherChars),
      );
    case "composite":
      return findCanonicalSelectorsByComposite(
        styleDocument,
        value.prefix,
        value.suffix,
        value.minLength,
        value.mustChars,
        value.mayChars,
        Boolean(value.mayIncludeOtherChars),
      );
    case "top":
      return styleDocument.selectors.filter((selector) => selector.viewKind === "canonical");
    default:
      value satisfies never;
      return [];
  }
}

function findCanonicalSelectorsByPrefix(
  styleDocument: StyleDocumentHIR,
  prefix: string,
): readonly SelectorDeclHIR[] {
  const emitted = new Set<string>();
  const resolved: SelectorDeclHIR[] = [];

  for (const selector of styleDocument.selectors) {
    if (!selector.name.startsWith(prefix)) continue;
    for (const canonical of findCanonicalSelectors(styleDocument, selector.name)) {
      if (emitted.has(canonical.id)) continue;
      emitted.add(canonical.id);
      resolved.push(canonical);
    }
  }

  return resolved;
}

function findCanonicalSelectorsBySuffix(
  styleDocument: StyleDocumentHIR,
  suffix: string,
): readonly SelectorDeclHIR[] {
  const emitted = new Set<string>();
  const resolved: SelectorDeclHIR[] = [];

  for (const selector of styleDocument.selectors) {
    if (!selector.name.endsWith(suffix)) continue;
    for (const canonical of findCanonicalSelectors(styleDocument, selector.name)) {
      if (emitted.has(canonical.id)) continue;
      emitted.add(canonical.id);
      resolved.push(canonical);
    }
  }

  return resolved;
}

function findCanonicalSelectorsByPrefixSuffix(
  styleDocument: StyleDocumentHIR,
  prefix: string,
  suffix: string,
): readonly SelectorDeclHIR[] {
  const emitted = new Set<string>();
  const resolved: SelectorDeclHIR[] = [];

  for (const selector of styleDocument.selectors) {
    if (!selector.name.startsWith(prefix) || !selector.name.endsWith(suffix)) continue;
    for (const canonical of findCanonicalSelectors(styleDocument, selector.name)) {
      if (emitted.has(canonical.id)) continue;
      emitted.add(canonical.id);
      resolved.push(canonical);
    }
  }

  return resolved;
}

function findCanonicalSelectorsByCharInclusion(
  styleDocument: StyleDocumentHIR,
  mustChars: string,
  mayChars: string,
  mayIncludeOtherChars: boolean,
): readonly SelectorDeclHIR[] {
  const mustSet = new Set(Array.from(mustChars));
  const maySet = new Set(Array.from(mayChars));
  const emitted = new Set<string>();
  const resolved: SelectorDeclHIR[] = [];

  for (const selector of styleDocument.selectors) {
    const charSet = new Set(Array.from(selector.name));
    if (Array.from(mustSet).some((char) => !charSet.has(char))) continue;
    if (!mayIncludeOtherChars && Array.from(charSet).some((char) => !maySet.has(char))) continue;
    for (const canonical of findCanonicalSelectors(styleDocument, selector.name)) {
      if (emitted.has(canonical.id)) continue;
      emitted.add(canonical.id);
      resolved.push(canonical);
    }
  }

  return resolved;
}

function findCanonicalSelectorsByComposite(
  styleDocument: StyleDocumentHIR,
  prefix: string | undefined,
  suffix: string | undefined,
  minLength: number | undefined,
  mustChars: string,
  mayChars: string,
  mayIncludeOtherChars: boolean,
): readonly SelectorDeclHIR[] {
  const mustSet = new Set(Array.from(mustChars));
  const maySet = new Set(Array.from(mayChars));
  const emitted = new Set<string>();
  const resolved: SelectorDeclHIR[] = [];

  for (const selector of styleDocument.selectors) {
    if (minLength !== undefined && selector.name.length < minLength) continue;
    if (prefix && !selector.name.startsWith(prefix)) continue;
    if (suffix && !selector.name.endsWith(suffix)) continue;
    const charSet = new Set(Array.from(selector.name));
    if (Array.from(mustSet).some((char) => !charSet.has(char))) continue;
    if (!mayIncludeOtherChars && Array.from(charSet).some((char) => !maySet.has(char))) continue;
    for (const canonical of findCanonicalSelectors(styleDocument, selector.name)) {
      if (emitted.has(canonical.id)) continue;
      emitted.add(canonical.id);
      resolved.push(canonical);
    }
  }

  return resolved;
}

function findCanonicalSelectors(
  styleDocument: StyleDocumentHIR,
  viewName: string,
): readonly SelectorDeclHIR[] {
  const matches = styleDocument.selectors.filter((selector) => selector.name === viewName);
  if (matches.length === 0) return [];
  const canonicalNames = new Set(matches.map((selector) => selector.canonicalName));
  const canonicalSelectors = styleDocument.selectors.filter(
    (selector) => selector.viewKind === "canonical" && canonicalNames.has(selector.canonicalName),
  );
  return canonicalSelectors.length > 0 ? canonicalSelectors : matches;
}

function uniqueSelectorsById(selectors: readonly SelectorDeclHIR[]): readonly SelectorDeclHIR[] {
  const emitted = new Set<string>();
  const result: SelectorDeclHIR[] = [];
  for (const selector of selectors) {
    if (emitted.has(selector.id)) continue;
    emitted.add(selector.id);
    result.push(selector);
  }
  return result;
}

function countCanonicalSelectors(styleDocument: StyleDocumentHIR): number {
  return styleDocument.selectors.filter((selector) => selector.viewKind === "canonical").length;
}
