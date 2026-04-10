import type { ScssClassMap } from "@css-module-explainer/shared";
import { contentHash } from "../util/hash.js";
import { parseStyleModule } from "./scss-parser.js";

// Re-export so existing consumers don't break.
export { parseStyleModule } from "./scss-parser.js";

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
  private readonly entries = new Map<string, StyleIndexCacheEntry>();
  private readonly max: number;

  constructor(options: { max: number }) {
    this.max = options.max;
  }

  get(filePath: string, content: string): ScssClassMap {
    const hash = contentHash(content);
    const cached = this.entries.get(filePath);
    if (cached && cached.hash === hash) {
      this.entries.delete(filePath);
      this.entries.set(filePath, cached);
      return cached.classMap;
    }

    const classMap = parseStyleModule(content, filePath);
    this.put(filePath, { hash, classMap });
    return classMap;
  }

  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  clear(): void {
    this.entries.clear();
  }

  private put(filePath: string, entry: StyleIndexCacheEntry): void {
    if (this.entries.has(filePath)) {
      this.entries.delete(filePath);
    } else if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(filePath, entry);
  }
}
