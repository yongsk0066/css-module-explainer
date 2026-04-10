import type { ScssClassMap } from "@css-module-explainer/shared";
import { contentHash } from "../util/hash";
import { LruMap } from "../util/lru-map";
import { parseStyleModule } from "./scss-parser";

// Re-export so existing consumers don't break.
export { parseStyleModule } from "./scss-parser";

// ──────────────────────────────────────────────────────────────
// StyleIndexCache
// ──────────────────────────────────────────────────────────────

interface StyleIndexCacheEntry {
  hash: string;
  classMap: ScssClassMap;
}

/**
 * Content-hashed LRU cache for parseStyleModule results.
 *
 * - Hit path: provider asks for a file + its current content, we
 *   compute a content hash once and return the cached ScssClassMap
 *   by reference identity.
 * - Miss path: we call parseStyleModule, store the result, and
 *   return it.
 * - Eviction: insertion order + size bound; a hit moves the entry
 *   to the end so active files stay warm.
 */
export class StyleIndexCache {
  private readonly lru: LruMap<string, StyleIndexCacheEntry>;

  constructor(options: { max: number }) {
    this.lru = new LruMap(options.max);
  }

  get(filePath: string, content: string): ScssClassMap {
    const hash = contentHash(content);
    const cached = this.lru.get(filePath);
    if (cached && cached.hash === hash) {
      this.lru.touch(filePath, cached);
      return cached.classMap;
    }

    const classMap = parseStyleModule(content, filePath);
    this.lru.set(filePath, { hash, classMap });
    return classMap;
  }

  invalidate(filePath: string): void {
    this.lru.delete(filePath);
  }

  clear(): void {
    this.lru.clear();
  }
}
