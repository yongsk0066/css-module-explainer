import { describe, it, expect } from "vitest";
import { LruMap } from "../../../server/src/core/util/lru-map.js";

describe("LruMap", () => {
  it("stores and retrieves values", () => {
    const map = new LruMap<string, number>(10);
    map.set("a", 1);
    expect(map.get("a")).toBe(1);
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(false);
  });

  it("overwrites existing keys without growing", () => {
    const map = new LruMap<string, number>(10);
    map.set("a", 1);
    map.set("a", 2);
    expect(map.get("a")).toBe(2);
  });

  it("evicts the oldest entry when max is exceeded", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3); // evicts "a"
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("touch moves an entry to the end (prevents eviction)", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    map.touch("a", 1); // move "a" to end → order: b, a
    map.set("c", 3); // evicts "b"
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(true);
  });

  it("delete removes an entry", () => {
    const map = new LruMap<string, number>(10);
    map.set("a", 1);
    expect(map.delete("a")).toBe(true);
    expect(map.has("a")).toBe(false);
    expect(map.delete("a")).toBe(false);
  });

  it("clear removes all entries", () => {
    const map = new LruMap<string, number>(10);
    map.set("a", 1);
    map.set("b", 2);
    map.clear();
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(false);
  });

  it("touch on a non-existent key is a no-op", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.touch("missing", 99);
    expect(map.has("missing")).toBe(false);
    expect(map.get("a")).toBe(1);
  });

  it("set overwrite repositions the key to the end", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 10); // overwrite → moves "a" to end, order: b, a
    map.set("c", 3); // evicts "b"
    expect(map.has("b")).toBe(false);
    expect(map.get("a")).toBe(10);
    expect(map.get("c")).toBe(3);
  });

  it("get does not promote (no auto-touch)", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    map.get("a"); // read-only, does NOT reposition
    map.set("c", 3); // evicts "a" (still oldest)
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(true);
    expect(map.has("c")).toBe(true);
  });

  it("works with max = 1", () => {
    const map = new LruMap<string, number>(1);
    map.set("a", 1);
    expect(map.get("a")).toBe(1);
    map.set("b", 2); // evicts "a"
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe(2);
  });
});
