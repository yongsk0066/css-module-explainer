import { describe, it, expect } from "vitest";
import type { Rule } from "postcss";
import {
  buildChildContext,
  enumerateGroups,
  findBemSuffixSpan,
  parseStyleModule,
  StyleIndexCache,
} from "../../../server/src/core/scss/scss-index";

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

    it("does not flip the flat parent's isNested flag when nested is '&:hover'", () => {
      const map = parseStyleModule(
        `.button { color: red; &:hover { color: blue; } }`,
        "/fake/a.module.scss",
      );
      expect(map.has("button")).toBe(true);
      // `.button { &:hover {} }` must keep `.button` as a flat entry
      // so rename is not silently rejected on this BEM+SCSS shape.
      expect(map.get("button")!.isNested).not.toBe(true);
    });

    it("&--suffix: flat parent stays flat, BEM variant is nested", () => {
      const map = parseStyleModule(
        `.button { color: red; &--primary { background: blue; } }`,
        "/fake/a.module.scss",
      );
      expect(map.get("button")!.isNested).not.toBe(true);
      expect(map.get("button--primary")!.isNested).toBe(true);
    });

    it("&.active: flat parent stays flat, compound sibling is nested", () => {
      const map = parseStyleModule(
        `.button { color: red; &.active { color: blue; } }`,
        "/fake/a.module.scss",
      );
      expect(map.get("button")!.isNested).not.toBe(true);
      // `active` is a brand-new class introduced inside the nested rule,
      // so it inherits the nested flag.
      expect(map.get("active")!.isNested).toBe(true);
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

  describe("compound selectors", () => {
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

  describe("token range word-boundary", () => {
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

  describe("partial parse recovery", () => {
    it("returns an empty map when a late syntax error breaks the whole file", () => {
      // postcss throws on the broken trailing rule; parse failure
      // returns an empty map — no partial results.
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

  // ── Wave 2B item #12: classnameTransform integration ──

  it("setMode('camelCase') clears the cache and next get() returns expanded map", () => {
    const cache = new StyleIndexCache({ max: 10 });
    const asIsMap = cache.get("/f.module.scss", `.btn-primary { color: red; }`);
    expect(asIsMap.has("btnPrimary")).toBe(false);
    cache.setMode("camelCase");
    const expanded = cache.get("/f.module.scss", `.btn-primary { color: red; }`);
    expect(expanded).not.toBe(asIsMap); // new reference
    expect(expanded.has("btn-primary")).toBe(true);
    expect(expanded.has("btnPrimary")).toBe(true);
    expect(expanded.get("btnPrimary")?.originalName).toBe("btn-primary");
  });

  it("setMode idempotent: setting the same mode does not clear", () => {
    const cache = new StyleIndexCache({ max: 10 });
    const first = cache.get("/f.module.scss", `.btn-primary { color: red; }`);
    cache.setMode("asIs"); // no-op
    const second = cache.get("/f.module.scss", `.btn-primary { color: red; }`);
    expect(second).toBe(first); // same reference — not cleared
  });
});

describe("buildChildContext", () => {
  it("bare single class: sets className, no isGrouped", () => {
    const ctx = buildChildContext([".a"], ".a");
    expect(ctx.selector).toBe(".a");
    expect(ctx.className).toBe("a");
    expect(ctx.isGrouped).toBeUndefined();
  });

  it("pseudo-bearing parent: no className, no isGrouped", () => {
    const ctx = buildChildContext([".a:hover"], ".a:hover");
    expect(ctx.selector).toBe(".a:hover");
    expect(ctx.className).toBeUndefined();
    expect(ctx.isGrouped).toBeUndefined();
  });

  it("grouped parent: isGrouped true, className undefined on each branch", () => {
    const first = buildChildContext([".a", ".b"], ".a");
    expect(first.selector).toBe(".a");
    expect(first.className).toBeUndefined();
    expect(first.isGrouped).toBe(true);

    const second = buildChildContext([".a", ".b"], ".b");
    expect(second.selector).toBe(".b");
    expect(second.className).toBeUndefined();
    expect(second.isGrouped).toBe(true);
  });

  it("descendant compound parent: no className", () => {
    const ctx = buildChildContext([".a .b"], ".a .b");
    expect(ctx.selector).toBe(".a .b");
    expect(ctx.className).toBeUndefined();
    expect(ctx.isGrouped).toBeUndefined();
  });
});

describe("enumerateGroups", () => {
  it("splits a simple comma-separated selector", () => {
    expect(enumerateGroups(".a, .b")).toEqual([
      { raw: ".a", offset: 0 },
      { raw: ".b", offset: 3 },
    ]);
  });

  it("respects paren depth inside :is(...)", () => {
    const result = enumerateGroups(":is(.a, .b) .c");
    expect(result).toHaveLength(1);
    expect(result[0]!.raw).toBe(":is(.a, .b) .c");
    expect(result[0]!.offset).toBe(0);
  });

  it("passes comment text through verbatim", () => {
    const result = enumerateGroups(".a /* x */ b");
    expect(result).toHaveLength(1);
    expect(result[0]!.raw).toBe(".a /* x */ b");
  });
});

describe("findBemSuffixSpan", () => {
  // Helper: build a minimal postcss-Rule-like mock whose
  // `source.start.offset === 0` and `input.fromOffset` returns a
  // fake 1-based { line, col } computed from the given content.
  // Sufficient for exercising the offset math in isolation.
  function mockRule(content: string): Rule {
    return {
      source: {
        start: { offset: 0, line: 1, column: 1 },
        input: {
          fromOffset(offset: number): { line: number; col: number } | null {
            if (offset < 0 || offset > content.length) return null;
            let line = 1;
            let col = 1;
            for (let i = 0; i < offset; i++) {
              if (content[i] === "\n") {
                line++;
                col = 1;
              } else {
                col++;
              }
            }
            return { line, col };
          },
        },
      },
    } as unknown as Rule;
  }

  it("accepts `&--primary`", () => {
    const result = findBemSuffixSpan(mockRule("&--primary"), 0, "&--primary");
    expect(result).not.toBeNull();
    expect(result!.rawToken).toBe("&--primary");
    expect(result!.range.start).toEqual({ line: 0, character: 0 });
    expect(result!.range.end).toEqual({ line: 0, character: 10 });
  });

  it("accepts `&__icon`", () => {
    const result = findBemSuffixSpan(mockRule("&__icon"), 0, "&__icon");
    expect(result).not.toBeNull();
    expect(result!.rawToken).toBe("&__icon");
    expect(result!.range.end.character - result!.range.start.character).toBe(7);
  });

  it("rejects compound `&.active`", () => {
    expect(findBemSuffixSpan(mockRule("&.active"), 0, "&.active")).toBeNull();
  });

  it("rejects pseudo `&:hover`", () => {
    expect(findBemSuffixSpan(mockRule("&:hover"), 0, "&:hover")).toBeNull();
  });

  it("rejects combinator-before `.a &--x`", () => {
    expect(findBemSuffixSpan(mockRule(".a &--x"), 0, ".a &--x")).toBeNull();
  });

  it("rejects descendant-after `&--x .y`", () => {
    expect(findBemSuffixSpan(mockRule("&--x .y"), 0, "&--x .y")).toBeNull();
  });

  it("accepts hyphenated `&--primary-inverse`", () => {
    const result = findBemSuffixSpan(mockRule("&--primary-inverse"), 0, "&--primary-inverse");
    expect(result).not.toBeNull();
    expect(result!.rawToken).toBe("&--primary-inverse");
    expect(result!.range.end.character - result!.range.start.character).toBe(18);
  });

  it("returns null when `rule.source.start` is undefined", () => {
    const rule = { source: {} } as unknown as Rule;
    expect(findBemSuffixSpan(rule, 0, "&--primary")).toBeNull();
  });

  it("accepts trailing-whitespace-only `&--primary  ` (off-by-one regression catcher)", () => {
    // The step 6 slice must be `slice(ampIndex + fragment.length).trim()`,
    // NOT `... - 1`. An off-by-one implementation would see `"y  "` and
    // reject — this test locks the correct semantics.
    const result = findBemSuffixSpan(mockRule("&--primary  "), 0, "&--primary  ");
    expect(result).not.toBeNull();
    expect(result!.rawToken).toBe("&--primary");
  });

  it("rejects descendant-after sibling `&--primary .y`", () => {
    expect(findBemSuffixSpan(mockRule("&--primary .y"), 0, "&--primary .y")).toBeNull();
  });

  it("rejects immediate-compound prefix `.a&--x` / `#id&--x` / `[data-x]&--x` / `tag&--x`", () => {
    // Without the step 3 "nothing before the &" check, the resolved
    // selector would be `.a.parent--x` which extractClassNames turns
    // into TWO classes, violating the §2.4 single-class invariant.
    expect(findBemSuffixSpan(mockRule(".a&--x"), 0, ".a&--x")).toBeNull();
    expect(findBemSuffixSpan(mockRule("#id&--x"), 0, "#id&--x")).toBeNull();
    expect(findBemSuffixSpan(mockRule("[data-x]&--x"), 0, "[data-x]&--x")).toBeNull();
    expect(findBemSuffixSpan(mockRule("tag&--x"), 0, "tag&--x")).toBeNull();
  });
});

describe("BEM suffix info", () => {
  // Positive: bemSuffix populated
  it("populates bemSuffix for `.button { &--primary {} }`", () => {
    const map = parseStyleModule(`.button { &--primary {} }`, "/f.module.scss");
    const info = map.get("button--primary");
    expect(info).toBeDefined();
    expect(info!.isNested).toBe(true);
    expect(info!.bemSuffix).toBeDefined();
    expect(info!.bemSuffix!.rawToken).toBe("&--primary");
    expect(info!.bemSuffix!.parentResolvedName).toBe("button");
    const r = info!.bemSuffix!.rawTokenRange;
    expect(r.end.character - r.start.character).toBe(10);
  });

  it("populates bemSuffix for `.button { &__icon {} }`", () => {
    const map = parseStyleModule(`.button { &__icon {} }`, "/f.module.scss");
    const info = map.get("button__icon");
    expect(info).toBeDefined();
    expect(info!.bemSuffix!.rawToken).toBe("&__icon");
    expect(info!.bemSuffix!.parentResolvedName).toBe("button");
    const r = info!.bemSuffix!.rawTokenRange;
    expect(r.end.character - r.start.character).toBe(7);
  });

  it("populates bemSuffix on multi-line source — rawTokenRange lands on the `&` line", () => {
    const src = `.button {\n  &--primary {}\n}`;
    const map = parseStyleModule(src, "/f.module.scss");
    const info = map.get("button--primary");
    expect(info).toBeDefined();
    const r = info!.bemSuffix!.rawTokenRange;
    expect(r.start.line).toBe(1);
    expect(r.start.character).toBe(2);
    expect(r.end.character - r.start.character).toBe(10);
  });

  it("handles CRLF source correctly", () => {
    // CRLF column-shift regression catcher: a handler that counted
    // \r into line length would drift by 1 character.
    const src = `.button {\r\n  &--primary {}\r\n}`;
    const map = parseStyleModule(src, "/f.module.scss");
    const info = map.get("button--primary");
    expect(info).toBeDefined();
    const r = info!.bemSuffix!.rawTokenRange;
    expect(r.start.line).toBe(1);
    expect(r.start.character).toBe(2);
    expect(r.end.character - r.start.character).toBe(10);
  });

  it("populates bemSuffix for deep-nested `.card { &__icon { &--small {} } }`", () => {
    const map = parseStyleModule(`.card { &__icon { &--small {} } }`, "/f.module.scss");
    const inner = map.get("card__icon--small");
    expect(inner).toBeDefined();
    expect(inner!.bemSuffix!.rawToken).toBe("&--small");
    expect(inner!.bemSuffix!.parentResolvedName).toBe("card__icon");

    const middle = map.get("card__icon");
    expect(middle).toBeDefined();
    expect(middle!.bemSuffix!.rawToken).toBe("&__icon");
    expect(middle!.bemSuffix!.parentResolvedName).toBe("card");
  });

  it("populates bemSuffix via comment-bearing parent `.a /* x */ { &--b {} }`", () => {
    const src = `.a /* x */ { &--b {} }`;
    const map = parseStyleModule(src, "/f.module.scss");
    const info = map.get("a--b");
    expect(info).toBeDefined();
    expect(info!.bemSuffix!.rawToken).toBe("&--b");
    expect(info!.bemSuffix!.parentResolvedName).toBe("a");
  });

  // Negative: isNested true but bemSuffix undefined
  it("leaves bemSuffix undefined for compound `.button { &.active {} }` (reject compound)", () => {
    const map = parseStyleModule(`.button { &.active {} }`, "/f.module.scss");
    const active = map.get("active");
    expect(active).toBeDefined();
    expect(active!.isNested).toBe(true);
    expect(active!.bemSuffix).toBeUndefined();
    // button parent entry must survive unchanged
    const button = map.get("button");
    expect(button).toBeDefined();
    expect(button!.isNested).toBeUndefined();
  });

  it("preserves flat parent for `.button { &:hover {} }` (dedup guard)", () => {
    const map = parseStyleModule(`.button { &:hover {} }`, "/f.module.scss");
    const button = map.get("button");
    expect(button).toBeDefined();
    expect(button!.isNested).toBeUndefined();
    expect(button!.bemSuffix).toBeUndefined();
  });

  it("handles non-bare parent `.card:hover { &--primary {} }` safely", () => {
    // extractClassNames strips `:hover--primary` greedily (pseudo
    // regex eats the hyphenated suffix), so the nested rule
    // resolves to class `card`. The dedup guard keeps the flat
    // `.card:hover` entry from being downgraded. Net result: no
    // `card--primary` entry exists, and the flat `card` entry is
    // unchanged — safe.
    const map = parseStyleModule(`.card:hover { &--primary {} }`, "/f.module.scss");
    expect(map.has("card--primary")).toBe(false);
    const card = map.get("card");
    expect(card).toBeDefined();
    expect(card!.isNested).toBeUndefined();
    expect(card!.bemSuffix).toBeUndefined();
  });

  it("leaves bemSuffix undefined for grouped parent `.a, .b { &--c {} }`", () => {
    const map = parseStyleModule(`.a, .b { &--c {} }`, "/f.module.scss");
    const info = map.get("a--c") ?? map.get("b--c");
    expect(info).toBeDefined();
    expect(info!.isNested).toBe(true);
    expect(info!.bemSuffix).toBeUndefined();
  });

  it("leaves bemSuffix undefined for grouped-nested child `.btn { &--a, &--b {} }`", () => {
    const map = parseStyleModule(`.btn { &--a, &--b {} }`, "/f.module.scss");
    const a = map.get("btn--a");
    const b = map.get("btn--b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.bemSuffix).toBeUndefined();
    expect(b!.bemSuffix).toBeUndefined();
  });

  it("leaves bemSuffix undefined for multi-`&` `.btn { & + &--x {} }`", () => {
    const map = parseStyleModule(`.btn { & + &--x {} }`, "/f.module.scss");
    const info = map.get("btn--x");
    if (info !== undefined) {
      expect(info.bemSuffix).toBeUndefined();
    }
  });

  it("skips interpolated top-level rules `.#{$prefix}--primary {}`", () => {
    // extractClassNames doesn't match .#{...}, so no entry is
    // produced. No crash is the goal.
    const map = parseStyleModule(`.#{$prefix}--primary { color: red; }`, "/f.module.scss");
    expect(map.size).toBe(0);
  });

  it("does not crash on `@at-root &--escape {}`", () => {
    // Invalid SCSS shape — we just don't want a throw.
    const content = `.btn { @at-root &--escape {} }`;
    expect(() => parseStyleModule(content, "/f.module.scss")).not.toThrow();
  });
});
