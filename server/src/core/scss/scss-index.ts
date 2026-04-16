import type { StyleDocumentHIR } from "../hir/style-types";
import { contentHash } from "../util/hash";
import { LruMap } from "../util/lru-map";
import {
  expandStyleDocumentWithTransform,
  type ClassnameTransformMode,
} from "./classname-transform";
import { parseStyleDocument } from "./scss-parser";

export { parseStyleDocument, buildChildContext, type ParentContext } from "./scss-parser";
export { findBemSuffixSpan } from "./bem-suffix";
export { enumerateGroups } from "./scss-selector-utils";

export interface StyleIndexEntry {
  readonly hash: string;
  readonly mode: ClassnameTransformMode;
  readonly styleDocument: StyleDocumentHIR;
}

const CLASSNAME_TRANSFORM_MODES: readonly ClassnameTransformMode[] = [
  "asIs",
  "camelCase",
  "camelCaseOnly",
  "dashes",
  "dashesOnly",
];

/**
 * Content-hashed LRU cache for transformed style-document HIR.
 *
 * - Hit path: provider asks for a file + its current content; the
 *   cache returns the previously-built `StyleIndexEntry` by
 *   reference identity when (content-hash, mode) match.
 * - Miss path: parse `StyleDocumentHIR` → apply transform aliases →
 *   store the transformed style document.
 * - Mode change: `setMode` clears the whole LRU. Keys that were
 *   valid under the old mode may not exist under the new one, so
 *   a full rebuild is correct. 500-entry LRU makes this cheap.
 */
export class StyleIndexCache {
  private readonly lru: LruMap<string, StyleIndexEntry>;

  constructor(options: { max: number }) {
    this.lru = new LruMap(options.max);
  }

  getStyleDocument(
    filePath: string,
    content: string,
    mode: ClassnameTransformMode = "asIs",
  ): StyleDocumentHIR {
    return this.getEntry(filePath, content, mode).styleDocument;
  }

  getEntry(
    filePath: string,
    content: string,
    mode: ClassnameTransformMode = "asIs",
  ): StyleIndexEntry {
    const cacheKey = this.key(filePath, mode);
    const hash = contentHash(content);
    const cached = this.lru.get(cacheKey);
    if (cached && cached.hash === hash && cached.mode === mode) {
      this.lru.touch(cacheKey, cached);
      return cached;
    }

    const base = parseStyleDocument(content, filePath);
    const styleDocument = expandStyleDocumentWithTransform(base, mode);
    const entry: StyleIndexEntry = {
      hash,
      mode,
      styleDocument,
    };
    this.lru.set(cacheKey, entry);
    return entry;
  }

  peekEntry(filePath: string, mode: ClassnameTransformMode = "asIs"): StyleIndexEntry | null {
    return this.lru.get(this.key(filePath, mode)) ?? null;
  }

  invalidate(filePath: string): void {
    for (const mode of CLASSNAME_TRANSFORM_MODES) {
      this.lru.delete(this.key(filePath, mode));
    }
  }

  clear(): void {
    this.lru.clear();
  }

  private key(filePath: string, mode: ClassnameTransformMode): string {
    return `${mode}\u0000${filePath}`;
  }
}

export function styleDocumentSemanticFingerprint(styleDocument: StyleDocumentHIR): string {
  const selectorFingerprint = styleDocument.selectors
    .map((selector) => {
      const composes = selector.composes
        .map((ref) => {
          const classNames = [...ref.classNames].toSorted().join(",");
          return `${ref.from ?? ""}:${ref.fromGlobal ? "global" : "local"}:${classNames}`;
        })
        .toSorted()
        .join("|");
      const bemSuffix = selector.bemSuffix
        ? `${selector.bemSuffix.rawToken}:${selector.bemSuffix.parentResolvedName}`
        : "";
      return [
        selector.name,
        selector.canonicalName,
        selector.viewKind,
        selector.fullSelector,
        selector.range.start.line,
        selector.range.start.character,
        selector.range.end.line,
        selector.range.end.character,
        selector.nestedSafety,
        selector.originalName ?? "",
        bemSuffix,
        composes,
      ].join("::");
    })
    .join("\n");
  const keyframesFingerprint = styleDocument.keyframes
    .map((keyframes) =>
      [
        keyframes.name,
        keyframes.range.start.line,
        keyframes.range.start.character,
        keyframes.range.end.line,
        keyframes.range.end.character,
      ].join("::"),
    )
    .join("\n");
  const animationRefFingerprint = styleDocument.animationNameRefs
    .map((ref) =>
      [
        ref.name,
        ref.property,
        ref.range.start.line,
        ref.range.start.character,
        ref.range.end.line,
        ref.range.end.character,
      ].join("::"),
    )
    .join("\n");
  const valueDeclFingerprint = styleDocument.valueDecls
    .map((valueDecl) =>
      [
        valueDecl.name,
        valueDecl.value,
        valueDecl.range.start.line,
        valueDecl.range.start.character,
        valueDecl.range.end.line,
        valueDecl.range.end.character,
      ].join("::"),
    )
    .join("\n");
  const valueRefFingerprint = styleDocument.valueRefs
    .map((valueRef) =>
      [
        valueRef.name,
        valueRef.source,
        valueRef.range.start.line,
        valueRef.range.start.character,
        valueRef.range.end.line,
        valueRef.range.end.character,
      ].join("::"),
    )
    .join("\n");
  return [
    selectorFingerprint,
    keyframesFingerprint,
    animationRefFingerprint,
    valueDeclFingerprint,
    valueRefFingerprint,
  ].join("\n---\n");
}
