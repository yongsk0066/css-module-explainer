import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import { rangeContains } from "../util/range-utils";

export function findSelectorAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): SelectorDeclHIR | null {
  for (const selector of styleDocument.selectors) {
    const hitRange = selector.bemSuffix?.rawTokenRange ?? selector.range;
    if (rangeContains(hitRange, line, character)) return selector;
  }
  return null;
}

export function findCanonicalSelector(
  styleDocument: StyleDocumentHIR,
  selector: SelectorDeclHIR,
): SelectorDeclHIR {
  return (
    styleDocument.selectors.find(
      (candidate) =>
        candidate.canonicalName === selector.canonicalName && candidate.viewKind === "canonical",
    ) ?? selector
  );
}

export function listCanonicalSelectors(
  styleDocument: StyleDocumentHIR,
): readonly SelectorDeclHIR[] {
  const canonicalSelectors: SelectorDeclHIR[] = [];
  const emitted = new Set<string>();

  for (const selector of styleDocument.selectors) {
    if (emitted.has(selector.canonicalName)) continue;
    emitted.add(selector.canonicalName);
    canonicalSelectors.push(findCanonicalSelector(styleDocument, selector));
  }

  return canonicalSelectors;
}
