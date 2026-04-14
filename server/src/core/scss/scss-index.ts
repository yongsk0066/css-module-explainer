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
