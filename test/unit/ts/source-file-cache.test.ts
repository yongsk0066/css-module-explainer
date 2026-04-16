import { describe, it, expect } from "vitest";
import { SourceFileCache } from "../../../server/engine-core-ts/src/core/ts/source-file-cache";

describe("SourceFileCache", () => {
  it("returns the same SourceFile for identical content", () => {
    const cache = new SourceFileCache({ max: 10 });
    const first = cache.get("/fake/a.tsx", `const x = 1;`);
    const second = cache.get("/fake/a.tsx", `const x = 1;`);
    expect(second).toBe(first);
  });

  it("re-parses when content changes", () => {
    const cache = new SourceFileCache({ max: 10 });
    const first = cache.get("/fake/a.tsx", `const x = 1;`);
    const second = cache.get("/fake/a.tsx", `const x = 2;`);
    expect(second).not.toBe(first);
  });

  it("parses .tsx with TSX script kind (JSX syntax works)", () => {
    const cache = new SourceFileCache({ max: 10 });
    const sf = cache.get("/fake/a.tsx", `const x = <div />;`);
    expect(sf.fileName).toBe("/fake/a.tsx");
  });

  it("parses .ts with TS script kind", () => {
    const cache = new SourceFileCache({ max: 10 });
    const sf = cache.get("/fake/a.ts", `const x: number = 1;`);
    expect(sf.fileName).toBe("/fake/a.ts");
  });

  it("parses .jsx with JSX script kind", () => {
    const cache = new SourceFileCache({ max: 10 });
    const sf = cache.get("/fake/a.jsx", `const x = <div />;`);
    expect(sf.fileName).toBe("/fake/a.jsx");
  });

  it("parses .js with JS script kind", () => {
    const cache = new SourceFileCache({ max: 10 });
    const sf = cache.get("/fake/a.js", `const x = 1;`);
    expect(sf.fileName).toBe("/fake/a.js");
  });

  it("invalidate(path) drops the cached entry", () => {
    const cache = new SourceFileCache({ max: 10 });
    const first = cache.get("/fake/a.tsx", `const x = 1;`);
    cache.invalidate("/fake/a.tsx");
    const second = cache.get("/fake/a.tsx", `const x = 1;`);
    expect(second).not.toBe(first);
  });

  it("clear() drops every entry", () => {
    const cache = new SourceFileCache({ max: 10 });
    cache.get("/fake/a.tsx", `const x = 1;`);
    cache.get("/fake/b.tsx", `const y = 2;`);
    cache.clear();
    const fresh = cache.get("/fake/a.tsx", `const x = 1;`);
    expect(fresh).toBeTruthy();
  });

  it("evicts the least-recently-used entry beyond the max", () => {
    const cache = new SourceFileCache({ max: 2 });
    const a = cache.get("/a.tsx", `const a = 1;`);
    cache.get("/b.tsx", `const b = 2;`);
    cache.get("/a.tsx", `const a = 1;`); // touch a
    cache.get("/c.tsx", `const c = 3;`); // evicts b (LRU)
    const aAgain = cache.get("/a.tsx", `const a = 1;`);
    expect(aAgain).toBe(a);
  });

  it("sets parent pointers so consumers can walk up the tree", () => {
    const cache = new SourceFileCache({ max: 10 });
    const sf = cache.get("/fake/a.tsx", `const x = 1;`);
    const firstStatement = sf.statements[0]!;
    expect(firstStatement.parent).toBe(sf);
  });
});
