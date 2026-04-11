import { describe, expect, it } from "vitest";
import { parseStyleModule } from "../../../server/src/core/scss/scss-parser";

/**
 * Grammar-routing regression tests.
 *
 * postcss's top-level `parse(content, opts)` silently ignores
 * `opts.syntax` and always uses the CSS grammar. Any SCSS- or
 * LESS-only feature routed through it throws, and the blanket
 * catch in `parseStyleModule` would swallow the throw and return
 * an empty classMap — wiping every provider for the affected file.
 * These tests pin the exact class set so the dispatch stays honest.
 */

describe("SCSS grammar features reach the SCSS parser", () => {
  it("`//` line comment before a rule", () => {
    const m = parseStyleModule(`// leading comment\n.btn { color: red; }`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("`//` line comment between rules", () => {
    const m = parseStyleModule(`.a {}\n// gap\n.b {}`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["a", "b"]);
  });

  it("`//` line comment after all rules", () => {
    const m = parseStyleModule(`.a {}\n.b {}\n// trailing`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["a", "b"]);
  });

  it("`//` line comment with an odd number of apostrophes", () => {
    // Without the grammar fix, the CSS parser sees `'` as a
    // string-literal start and scans to EOF looking for the close,
    // then throws `unterminated string` — the classMap collapses
    // to empty. Real-world English prose in comments hits this
    // constantly (don't, it's, doesn't, …).
    const m = parseStyleModule(
      `// don't conflate the flat and nested forms\n.btn {}`,
      "/f.module.scss",
    );
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("`//` line comment inside a rule block", () => {
    const m = parseStyleModule(`.btn {\n  // inline\n  color: red;\n}`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("multi-line `//` comment with apostrophe", () => {
    const m = parseStyleModule(
      `// line 1\n// line 2 — don't conflate\n// line 3\n.btn {}`,
      "/f.module.scss",
    );
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("SCSS variable + interpolation `#{$var}`", () => {
    const m = parseStyleModule(`$color: red;\n.btn { color: #{$color}; }`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("`@use` directive", () => {
    const m = parseStyleModule(
      `@use 'sass:math';\n.btn { width: math.div(100px, 2); }`,
      "/f.module.scss",
    );
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("`@mixin` and `@include`", () => {
    const m = parseStyleModule(
      `@mixin rounded { border-radius: 4px; }\n.btn { @include rounded; }`,
      "/f.module.scss",
    );
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("`@extend` inside a rule", () => {
    const m = parseStyleModule(
      `.base { color: red; }\n.btn { @extend .base; padding: 8px; }`,
      "/f.module.scss",
    );
    expect([...m.keys()]).toEqual(["base", "btn"]);
  });

  it("`@media` wrapping rules that contain `//` line comments", () => {
    const m = parseStyleModule(
      `@media (min-width: 600px) {\n  // responsive tweak\n  .btn { font-size: 16px; }\n}`,
      "/f.module.scss",
    );
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("`@import` directive", () => {
    const m = parseStyleModule(`@import 'shared/tokens';\n.btn { color: red; }`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["btn"]);
  });
});

describe("LESS grammar features reach the LESS parser", () => {
  it("`@variable` declaration", () => {
    // In LESS `@color: red;` is a variable; the CSS grammar would
    // treat `@color` as an unknown at-rule and recover/drop.
    const m = parseStyleModule(`@color: red;\n.btn { color: @color; }`, "/f.module.less");
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("selector interpolation `.@{var}`", () => {
    // The CSS grammar cannot tokenise `@{name}` inside a selector
    // and would throw. postcss-less accepts it. The interpolated
    // selector itself is dynamic so it does not surface as a key,
    // but sibling real classes must still reach the classMap.
    const m = parseStyleModule(
      `@name: button;\n.@{name} { color: red; }\n.unrelated { padding: 4px; }`,
      "/f.module.less",
    );
    expect(m.has("unrelated")).toBe(true);
  });

  it("mixin guard `.mixin() when (...)`", () => {
    // LESS mixin guards are the headline LESS-only feature that
    // CSS-side tokenisers never learned. This pins that the
    // guard expression survives parsing so unrelated rules in the
    // same file still populate the classMap.
    const m = parseStyleModule(
      `.shrink(@s) when (@s < 10) {\n  font-size: @s;\n}\n.btn { .shrink(8); }`,
      "/f.module.less",
    );
    expect(m.has("btn")).toBe(true);
  });
});

describe("CSS grammar still routes through the default postcss parser", () => {
  // `.module.css` records `syntax: null` in lang-registry — we
  // must continue to use the vanilla postcss parser for it, not
  // accidentally push plain CSS through postcss-scss.
  it("plain CSS module", () => {
    const m = parseStyleModule(`.btn { color: red; }\n.link { color: blue; }`, "/f.module.css");
    expect([...m.keys()]).toEqual(["btn", "link"]);
  });

  // CSS Nesting Level 1 (`& .child`) reached the default postcss
  // parser in 8.4+. Pinning this keeps the dispatch honest if
  // `lang-registry` ever swaps in a CSS-nesting-aware syntax.
  it("CSS Nesting Level 1 — `.a { &:hover {} }`", () => {
    const m = parseStyleModule(`.a { color: red; &:hover { color: blue; } }`, "/f.module.css");
    expect([...m.keys()]).toEqual(["a"]);
  });
});

describe("parse failure still yields an empty classMap", () => {
  // The blanket catch in `parseStyleModule` turns any parser throw
  // into an empty map so downstream providers stay alive. Pin the
  // contract explicitly so a future refactor that narrows or
  // removes the catch gets caught by this test.
  it("truly invalid SCSS returns an empty map", () => {
    const m = parseStyleModule(`{ this is not a stylesheet`, "/f.module.scss");
    expect(m.size).toBe(0);
  });
});

describe("Unicode class-name identifiers survive extraction", () => {
  // CSS Modules accepts Unicode identifiers in class selectors
  // (e.g. `.한글-버튼`, `.日本語`), and the grammar routes all three
  // parsers through them fine — but `extractClassNames` used an
  // ASCII-only regex, so the class map silently dropped any
  // selector whose identifier was outside the ASCII subset. Lock
  // the post-fix behaviour with selectors the old regex rejected.
  it("single-script Unicode class name stays in the class map", () => {
    const m = parseStyleModule(`.한글 { color: red; }`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["한글"]);
  });

  it("mixed ASCII + Unicode class name (ASCII-prefix + Hangul suffix)", () => {
    const m = parseStyleModule(`.btn-한글 { color: red; }`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["btn-한글"]);
  });

  it("multiple Unicode classes, each in its own rule", () => {
    const m = parseStyleModule(`.日本語 { color: red; }\n.español-btn {}`, "/f.module.scss");
    expect([...m.keys()]).toEqual(["日本語", "español-btn"]);
  });
});

describe("leading byte-order mark does not hide the first class", () => {
  // postcss, postcss-scss, and postcss-less all tolerate a leading
  // U+FEFF natively and produce a class map whose first entry is
  // the first real selector. Pin that invariant for every grammar
  // route so a parser swap or a top-level parser rewrite can't
  // silently regress files saved by BOM-emitting editors.
  it("UTF-8 BOM at the file start keeps the first selector in the class map", () => {
    const m = parseStyleModule("\uFEFF.btn { color: red; }", "/f.module.scss");
    expect([...m.keys()]).toEqual(["btn"]);
  });

  it("UTF-8 BOM + LESS file routes through the LESS parser without losing the first selector", () => {
    const m = parseStyleModule("\uFEFF.btn { color: red; }\n.btn-primary {}", "/f.module.less");
    expect([...m.keys()]).toEqual(["btn", "btn-primary"]);
  });

  it("UTF-8 BOM + CSS file still recognises the first selector", () => {
    const m = parseStyleModule("\uFEFF.btn { color: red; }", "/f.module.css");
    expect([...m.keys()]).toEqual(["btn"]);
  });
});

describe("CSS nesting + `&` suffix survive in every grammar", () => {
  // Regression guard: the flat `.button` entry must appear in the
  // classMap even when the rule contains nested `&--primary` and
  // `&:hover` children. This shape was the original motivating
  // fixture; it needs to keep working under every grammar.
  it("SCSS: `.button { &:hover {} &--primary {} }`", () => {
    const m = parseStyleModule(
      `.button {\n  color: red;\n  &:hover { filter: brightness(1.1); }\n  &--primary { background: blue; }\n}`,
      "/f.module.scss",
    );
    expect([...m.keys()]).toEqual(["button", "button--primary"]);
  });
});
