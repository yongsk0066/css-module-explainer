import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import type { AbstractClassValue } from "./class-value-domain";

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
