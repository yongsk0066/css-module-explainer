import type { ScssClassMap } from "@css-module-explainer/shared";
import { contentHash } from "../util/hash";
import { LruMap } from "../util/lru-map";
import { expandClassMapWithTransform, type ClassnameTransformMode } from "./classname-transform";
import { parseStyleModule } from "./scss-parser";

export { parseStyleModule, buildChildContext, type ParentContext } from "./scss-parser";
export { findBemSuffixSpan } from "./bem-suffix";
export { enumerateGroups } from "./scss-selector-utils";

interface StyleIndexCacheEntry {
  hash: string;
  mode: ClassnameTransformMode;
  classMap: ScssClassMap;
}

/**
 * Content-hashed LRU cache for parseStyleModule results +
 * classnameTransform expansion.
 *
 * - Hit path: provider asks for a file + its current content; the
 *   cache returns the previously-expanded `ScssClassMap` by
 *   reference identity when (content-hash, mode) match.
 * - Miss path: parse → `expandClassMapWithTransform(base, mode)` →
 *   store. `asIs` mode short-circuits the expansion so the stored
 *   map is reference-identical to `parseStyleModule`'s output.
 * - Mode change: `setMode` clears the whole LRU. Keys that were
 *   valid under the old mode may not exist under the new one, so
 *   a full rebuild is correct. 500-entry LRU makes this cheap.
 */
export class StyleIndexCache {
  private readonly lru: LruMap<string, StyleIndexCacheEntry>;
  private mode: ClassnameTransformMode = "asIs";

  constructor(options: { max: number }) {
    this.lru = new LruMap(options.max);
  }

  get(filePath: string, content: string): ScssClassMap {
    const hash = contentHash(content);
    const cached = this.lru.get(filePath);
    if (cached && cached.hash === hash && cached.mode === this.mode) {
      this.lru.touch(filePath, cached);
      return cached.classMap;
    }

    const base = parseStyleModule(content, filePath);
    const classMap = expandClassMapWithTransform(base, this.mode);
    this.lru.set(filePath, { hash, mode: this.mode, classMap });
    return classMap;
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
