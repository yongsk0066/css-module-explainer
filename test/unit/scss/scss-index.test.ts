import { describe, it, expect } from "vitest";
import { parseStyleModule, StyleIndexCache } from "../../../server/src/core/scss/scss-index.js";

describe("parseStyleModule / flat classes", () => {
  it("extracts a single flat class", () => {
    const map = parseStyleModule(`.button { color: red; padding: 8px; }`, "/fake/a.module.scss");
    expect(map.has("button")).toBe(true);
    const info = map.get("button")!;
    expect(info.name).toBe("button");
    expect(info.fullSelector).toBe(".button");
    expect(info.declarations).toContain("color: red");
    expect(info.declarations).toContain("padding: 8px");
  });

  it("extracts multiple flat classes", () => {
    const map = parseStyleModule(
      `.one { color: red; }\n.two { color: blue; }\n.three { color: green; }`,
      "/fake/a.module.scss",
    );
    expect(Array.from(map.keys())).toEqual(["one", "two", "three"]);
  });

  it("returns an empty map for files with no class selectors", () => {
    const map = parseStyleModule(
      `:root { --bg: red; }\nbody { margin: 0; }`,
      "/fake/a.module.scss",
    );
    expect(map.size).toBe(0);
  });

  it("returns an empty map on parse error without throwing", () => {
    // Unterminated block — postcss throws; parser must catch.
    const map = parseStyleModule(`.broken { color: `, "/fake/a.module.scss");
    expect(map.size).toBe(0);
  });

  it("uses vanilla postcss for .module.css (no SCSS syntax)", () => {
    const map = parseStyleModule(`.plain { color: red; }`, "/fake/a.module.css");
    expect(map.has("plain")).toBe(true);
  });

  it("records the class token range (0-based)", () => {
    const map = parseStyleModule(`.indicator { color: red; }`, "/fake/a.module.scss");
    const info = map.get("indicator")!;
    // ".indicator" starts at col 0; the class name 'indicator' starts at col 1
    expect(info.range.start.line).toBe(0);
    expect(info.range.start.character).toBe(1);
    expect(info.range.end.character).toBe(1 + "indicator".length);
  });

  it("records the full rule block range (ruleRange)", () => {
    const map = parseStyleModule(`.indicator {\n  color: red;\n}`, "/fake/a.module.scss");
    const info = map.get("indicator")!;
    expect(info.ruleRange.start.line).toBe(0);
    expect(info.ruleRange.end.line).toBeGreaterThanOrEqual(2);
  });
});

describe("parseStyleModule / edge cases", () => {
  describe(":global() wrapping", () => {
    it("excludes :global(.foo) from the class map", () => {
      const map = parseStyleModule(`:global(.btn) { color: red; }`, "/fake/a.module.scss");
      expect(map.has("btn")).toBe(false);
    });

    it("still includes sibling local classes in the same file", () => {
      const map = parseStyleModule(
        `:global(.btn) { color: red; }\n.card { padding: 8px; }`,
        "/fake/a.module.scss",
      );
      expect(map.has("btn")).toBe(false);
      expect(map.has("card")).toBe(true);
    });
  });

  describe(":local() wrapping", () => {
    it("includes :local(.foo) as 'foo'", () => {
      const map = parseStyleModule(`:local(.btn) { color: red; }`, "/fake/a.module.scss");
      expect(map.has("btn")).toBe(true);
    });
  });

  describe("& nesting", () => {
    it("resolves .button { &--primary { ... } } to button--primary", () => {
      const map = parseStyleModule(
        `.button { color: red; &--primary { background: blue; } }`,
        "/fake/a.module.scss",
      );
      expect(map.has("button")).toBe(true);
      expect(map.has("button--primary")).toBe(true);
    });

    it("handles deeply nested ampersand", () => {
      const map = parseStyleModule(
        `.card { &__header { &--large { font-size: 20px; } } }`,
        "/fake/a.module.scss",
      );
      expect(map.has("card__header--large")).toBe(true);
    });

    it("handles plain nested selectors without &", () => {
      const map = parseStyleModule(`.wrapper { .inner { color: red; } }`, "/fake/a.module.scss");
      // Only 'inner' is exposed on the styles object (last class wins).
      expect(map.has("inner")).toBe(true);
    });
  });

  describe("group selectors", () => {
    it("indexes each class in '.a, .b'", () => {
      const map = parseStyleModule(`.primary, .secondary { color: red; }`, "/fake/a.module.scss");
      expect(map.has("primary")).toBe(true);
      expect(map.has("secondary")).toBe(true);
    });

    it("shares declarations across grouped selectors", () => {
      const map = parseStyleModule(
        `.a, .b { color: red; font-size: 14px; }`,
        "/fake/a.module.scss",
      );
      expect(map.get("a")!.declarations).toContain("color: red");
      expect(map.get("b")!.declarations).toContain("color: red");
    });
  });

  describe("compound selectors (post-review correctness fix)", () => {
    it("indexes every class in '.foo.bar { ... }'", () => {
      const map = parseStyleModule(`.foo.bar { color: red; }`, "/fake/a.module.scss");
      expect(map.has("foo")).toBe(true);
      expect(map.has("bar")).toBe(true);
    });

    it("indexes only the rightmost compound segment in '.a .b.c'", () => {
      // CSS Modules exposes every class in the rightmost compound
      // segment. `.a` is an ancestor; `.b.c` is the compound that
      // keys the exported name.
      const map = parseStyleModule(`.a .b.c { color: red; }`, "/fake/a.module.scss");
      expect(map.has("b")).toBe(true);
      expect(map.has("c")).toBe(true);
      expect(map.has("a")).toBe(false);
    });
  });

  describe("token range word-boundary (post-review correctness fix)", () => {
    it("points to the standalone '.btn' in '.btn-primary .btn'", () => {
      const map = parseStyleModule(`.btn-primary .btn { color: red; }`, "/fake/a.module.scss");
      const btnInfo = map.get("btn")!;
      // '.btn-primary ' is 13 characters. '.btn' starts at column 13,
      // the class name 'btn' starts at column 14.
      expect(btnInfo.range.start.character).toBe(14);
      expect(btnInfo.range.end.character).toBe(14 + "btn".length);
    });

    it("does not collide class prefixes when .btn-primary is first", () => {
      const map = parseStyleModule(
        `.btn-primary { color: red; }\n.btn { color: blue; }`,
        "/fake/a.module.scss",
      );
      expect(map.get("btn")!.range.start.line).toBe(1);
      expect(map.get("btn-primary")!.range.start.line).toBe(0);
    });
  });

  describe("partial parse recovery (post-review test pin)", () => {
    it("returns an empty map when a late syntax error breaks the whole file", () => {
      // postcss throws on the broken trailing rule; we catch at the
      // file boundary and never surface the earlier valid rules.
      // Pinning this all-or-nothing behavior so future streaming
      // refactors do not silently change it.
      const map = parseStyleModule(
        `.valid { color: red; }\n.broken { color: `,
        "/fake/a.module.scss",
      );
      expect(map.size).toBe(0);
    });
  });

  describe("CSS variables", () => {
    it("includes --var-name declarations in the declarations text", () => {
      const map = parseStyleModule(`.theme { --bg: red; --fg: white; }`, "/fake/a.module.scss");
      expect(map.get("theme")!.declarations).toContain("--bg: red");
      expect(map.get("theme")!.declarations).toContain("--fg: white");
    });
  });

  describe("cascade last-wins", () => {
    it("uses the last declaration when a class is defined multiple times", () => {
      const map = parseStyleModule(
        `.btn { color: red; }\n.btn { color: blue; }`,
        "/fake/a.module.scss",
      );
      const info = map.get("btn")!;
      expect(info.declarations).toContain("color: blue");
      expect(info.declarations).not.toContain("color: red");
    });
  });

  describe("@keyframes / @font-face exclusion", () => {
    it("does not index identifiers inside @keyframes", () => {
      const map = parseStyleModule(
        `@keyframes fade { from { opacity: 0; } to { opacity: 1; } }`,
        "/fake/a.module.scss",
      );
      expect(map.has("fade")).toBe(false);
      expect(map.has("from")).toBe(false);
      expect(map.has("to")).toBe(false);
    });

    it("does not confuse @font-face blocks for rules", () => {
      const map = parseStyleModule(
        `@font-face { font-family: 'Inter'; src: url('x.woff2'); }`,
        "/fake/a.module.scss",
      );
      expect(map.size).toBe(0);
    });
  });

  describe("@media / @at-root unwrapping", () => {
    it("indexes classes inside @media", () => {
      const map = parseStyleModule(
        `@media (min-width: 600px) { .wide { padding: 16px; } }`,
        "/fake/a.module.scss",
      );
      expect(map.has("wide")).toBe(true);
    });

    it("indexes classes inside @at-root", () => {
      const map = parseStyleModule(
        `.parent { @at-root .escaped { color: red; } }`,
        "/fake/a.module.scss",
      );
      expect(map.has("escaped")).toBe(true);
    });
  });
});

describe("StyleIndexCache", () => {
  it("returns the same class map for identical content", () => {
    const cache = new StyleIndexCache({ max: 10 });
    const first = cache.get("/fake/a.module.scss", `.btn { color: red; }`);
    const second = cache.get("/fake/a.module.scss", `.btn { color: red; }`);
    expect(second).toBe(first);
  });

  it("re-parses when content changes", () => {
    const cache = new StyleIndexCache({ max: 10 });
    const first = cache.get("/fake/a.module.scss", `.btn { color: red; }`);
    const second = cache.get("/fake/a.module.scss", `.btn { color: blue; }`);
    expect(second).not.toBe(first);
    expect(second.get("btn")!.declarations).toContain("color: blue");
  });

  it("invalidate(path) drops the cached entry", () => {
    const cache = new StyleIndexCache({ max: 10 });
    const first = cache.get("/fake/a.module.scss", `.btn { color: red; }`);
    cache.invalidate("/fake/a.module.scss");
    const second = cache.get("/fake/a.module.scss", `.btn { color: red; }`);
    expect(second).not.toBe(first);
  });

  it("clear() drops everything", () => {
    const cache = new StyleIndexCache({ max: 10 });
    cache.get("/fake/a.module.scss", `.a { color: red; }`);
    cache.get("/fake/b.module.scss", `.b { color: red; }`);
    cache.clear();
    const after = cache.get("/fake/a.module.scss", `.a { color: red; }`);
    expect(after.has("a")).toBe(true);
  });

  it("evicts the least-recently-used entry beyond the max", () => {
    const cache = new StyleIndexCache({ max: 2 });
    const a = cache.get("/a.module.scss", `.a{}`);
    cache.get("/b.module.scss", `.b{}`);
    // LRU order: a, b
    cache.get("/a.module.scss", `.a{}`); // touch a → order: b, a
    cache.get("/c.module.scss", `.c{}`); // evicts b
    const aAgain = cache.get("/a.module.scss", `.a{}`);
    expect(aAgain).toBe(a);
    // b was evicted, so re-getting it reparses (different content string
    // still produces an equivalent map, but identity differs).
    const bAgain = cache.get("/b.module.scss", `.b{}`);
    expect(bAgain.has("b")).toBe(true);
  });
});
