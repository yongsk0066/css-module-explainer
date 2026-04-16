/**
 * Insertion-order LRU map backed by ES6 Map.
 *
 * On `set()`, if the map exceeds `max` entries the oldest key
 * (first insertion order) is evicted. On `touch()`, an existing
 * key is moved to the end so active entries stay warm.
 */
export class LruMap<K, V> {
  private readonly entries = new Map<K, V>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get(key: K): V | undefined {
    return this.entries.get(key);
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  set(key: K, value: V): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, value);
  }

  /** Move an existing key to the end (most-recent). No-op if absent. */
  touch(key: K, value: V): void {
    if (!this.entries.has(key)) return;
    this.entries.delete(key);
    this.entries.set(key, value);
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
