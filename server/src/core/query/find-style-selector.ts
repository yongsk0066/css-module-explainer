import path from "node:path";
import type {
  AnimationNameRefHIR,
  KeyframesDeclHIR,
  SelectorDeclHIR,
  StyleDocumentHIR,
  ValueDeclHIR,
  ValueRefHIR,
} from "../hir/style-types";
import { rangeContains } from "../util/range-utils";
import type { ComposesClassToken, ComposesRef } from "@css-module-explainer/shared";

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

export interface ComposesTokenHit {
  readonly selector: SelectorDeclHIR;
  readonly ref: ComposesRef;
  readonly token: ComposesClassToken;
}

export interface ResolvedComposesTarget {
  readonly filePath: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly selector: SelectorDeclHIR;
}

export function findComposesTokenAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): ComposesTokenHit | null {
  for (const selector of styleDocument.selectors) {
    for (const ref of selector.composes) {
      for (const token of ref.classTokens ?? []) {
        if (rangeContains(token.range, line, character)) {
          return { selector, ref, token };
        }
      }
    }
  }
  return null;
}

export function resolveComposesTarget(
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
  styleFilePath: string,
  hit: ComposesTokenHit | null,
): ResolvedComposesTarget | null {
  if (!hit || hit.ref.fromGlobal) return null;

  const targetFilePath = hit.ref.from
    ? path.resolve(path.dirname(styleFilePath), hit.ref.from)
    : styleFilePath;
  const targetDocument = styleDocumentForPath(targetFilePath);
  if (!targetDocument) return null;

  const selector =
    targetDocument.selectors.find(
      (candidate) =>
        candidate.canonicalName === hit.token.className && candidate.viewKind === "canonical",
    ) ??
    targetDocument.selectors.find((candidate) => candidate.canonicalName === hit.token.className);
  if (!selector) return null;

  return {
    filePath: targetDocument.filePath,
    styleDocument: targetDocument,
    selector: findCanonicalSelector(targetDocument, selector),
  };
}

export function findKeyframesAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): KeyframesDeclHIR | null {
  for (const keyframes of styleDocument.keyframes) {
    if (rangeContains(keyframes.range, line, character)) return keyframes;
  }
  return null;
}

export function findAnimationNameRefAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): AnimationNameRefHIR | null {
  for (const ref of styleDocument.animationNameRefs) {
    if (rangeContains(ref.range, line, character)) return ref;
  }
  return null;
}

export function findKeyframesByName(
  styleDocument: StyleDocumentHIR,
  name: string,
): KeyframesDeclHIR | null {
  return styleDocument.keyframes.find((keyframes) => keyframes.name === name) ?? null;
}

export function listAnimationNameRefs(
  styleDocument: StyleDocumentHIR,
  name: string,
): readonly AnimationNameRefHIR[] {
  return styleDocument.animationNameRefs.filter((ref) => ref.name === name);
}

export function findValueDeclAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): ValueDeclHIR | null {
  for (const valueDecl of styleDocument.valueDecls) {
    if (rangeContains(valueDecl.range, line, character)) return valueDecl;
  }
  return null;
}

export function findValueRefAtCursor(
  styleDocument: StyleDocumentHIR,
  line: number,
  character: number,
): ValueRefHIR | null {
  for (const valueRef of styleDocument.valueRefs) {
    if (rangeContains(valueRef.range, line, character)) return valueRef;
  }
  return null;
}

export function findValueDeclByName(
  styleDocument: StyleDocumentHIR,
  name: string,
): ValueDeclHIR | null {
  return styleDocument.valueDecls.find((valueDecl) => valueDecl.name === name) ?? null;
}

export function listValueRefs(
  styleDocument: StyleDocumentHIR,
  name: string,
): readonly ValueRefHIR[] {
  return styleDocument.valueRefs.filter((valueRef) => valueRef.name === name);
}
