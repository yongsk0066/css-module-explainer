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
    case "exact": {
      const selector = findCanonicalSelector(styleDocument, value.value);
      return selector ? [selector] : [];
    }
    case "finiteSet":
      return value.values.flatMap((candidate) => {
        const selector = findCanonicalSelector(styleDocument, candidate);
        return selector ? [selector] : [];
      });
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
    const canonical = findCanonicalSelector(styleDocument, selector.name);
    if (!canonical || emitted.has(canonical.canonicalName)) continue;
    emitted.add(canonical.canonicalName);
    resolved.push(canonical);
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
    const canonical = findCanonicalSelector(styleDocument, selector.name);
    if (!canonical || emitted.has(canonical.canonicalName)) continue;
    emitted.add(canonical.canonicalName);
    resolved.push(canonical);
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
    const canonical = findCanonicalSelector(styleDocument, selector.name);
    if (!canonical || emitted.has(canonical.canonicalName)) continue;
    emitted.add(canonical.canonicalName);
    resolved.push(canonical);
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
    const canonical = findCanonicalSelector(styleDocument, selector.name);
    if (!canonical || emitted.has(canonical.canonicalName)) continue;
    emitted.add(canonical.canonicalName);
    resolved.push(canonical);
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
    const canonical = findCanonicalSelector(styleDocument, selector.name);
    if (!canonical || emitted.has(canonical.canonicalName)) continue;
    emitted.add(canonical.canonicalName);
    resolved.push(canonical);
  }

  return resolved;
}

function findCanonicalSelector(
  styleDocument: StyleDocumentHIR,
  viewName: string,
): SelectorDeclHIR | null {
  const match = styleDocument.selectors.find((selector) => selector.name === viewName);
  if (!match) return null;
  return (
    styleDocument.selectors.find(
      (selector) =>
        selector.canonicalName === match.canonicalName && selector.viewKind === "canonical",
    ) ?? match
  );
}

function countCanonicalSelectors(styleDocument: StyleDocumentHIR): number {
  return styleDocument.selectors.filter((selector) => selector.viewKind === "canonical").length;
}
