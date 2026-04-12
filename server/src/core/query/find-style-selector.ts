import type { Range } from "@css-module-explainer/shared";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";

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

function rangeContains(range: Range, line: number, character: number): boolean {
  const { start, end } = range;
  if (line < start.line || line > end.line) return false;
  if (line === start.line && character < start.character) return false;
  if (line === end.line && character > end.character) return false;
  return true;
}
