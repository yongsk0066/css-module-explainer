import type { ScssClassMap } from "@css-module-explainer/shared";
import { styleDocumentToLegacyClassMap } from "../hir/compat/style-document-compat";
import type { StyleDocumentHIR } from "../hir/style-types";
import { contentHash } from "../util/hash";
import { LruMap } from "../util/lru-map";
import {
  expandStyleDocumentWithTransform,
  type ClassnameTransformMode,
} from "./classname-transform";
import { parseStyleDocument } from "./scss-parser";

export {
  parseStyleDocument,
  parseStyleModule,
  buildChildContext,
  type ParentContext,
} from "./scss-parser";
export { findBemSuffixSpan } from "./bem-suffix";
export { enumerateGroups } from "./scss-selector-utils";

export interface StyleIndexEntry {
  readonly hash: string;
  readonly mode: ClassnameTransformMode;
  readonly styleDocument: StyleDocumentHIR;
  readonly classMap: ScssClassMap;
}

/**
 * Content-hashed LRU cache for style-document HIR plus
 * compatibility class-map output.
 *
 * - Hit path: provider asks for a file + its current content; the
 *   cache returns the previously-built `StyleIndexEntry` by
 *   reference identity when (content-hash, mode) match.
 * - Miss path: parse `StyleDocumentHIR` → apply transform aliases →
 *   derive compatibility `ScssClassMap` and store both.
 * - Mode change: `setMode` clears the whole LRU. Keys that were
 *   valid under the old mode may not exist under the new one, so
 *   a full rebuild is correct. 500-entry LRU makes this cheap.
 */
export class StyleIndexCache {
  private readonly lru: LruMap<string, StyleIndexEntry>;
  private mode: ClassnameTransformMode = "asIs";

  constructor(options: { max: number }) {
    this.lru = new LruMap(options.max);
  }

  get(filePath: string, content: string): ScssClassMap {
    return this.getEntry(filePath, content).classMap;
  }

  getStyleDocument(filePath: string, content: string): StyleDocumentHIR {
    return this.getEntry(filePath, content).styleDocument;
  }

  getEntry(filePath: string, content: string): StyleIndexEntry {
    const hash = contentHash(content);
    const cached = this.lru.get(filePath);
    if (cached && cached.hash === hash && cached.mode === this.mode) {
      this.lru.touch(filePath, cached);
      return cached;
    }

    const base = parseStyleDocument(content, filePath);
    const styleDocument = expandStyleDocumentWithTransform(base, this.mode);
    const classMap = styleDocumentToLegacyClassMap(styleDocument);
    const entry: StyleIndexEntry = {
      hash,
      mode: this.mode,
      styleDocument,
      classMap,
    };
    this.lru.set(filePath, entry);
    return entry;
  }

  setMode(mode: ClassnameTransformMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.lru.clear();
  }

  invalidate(filePath: string): void {
    this.lru.delete(filePath);
  }

  clear(): void {
    this.lru.clear();
  }
}
