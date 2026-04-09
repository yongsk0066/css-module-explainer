# Plan 02 — SCSS Indexing (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse `.module.scss` and `.module.css` files into a typed `ScssClassMap` with all Q6 B edge cases handled, behind a small `StyleIndexCache` LRU.

**Architecture:** Two core modules land under `server/src/core/scss/`. `lang-registry.ts` holds the immutable list of supported style languages (`scss`, `css`) with their postcss syntaxes, plus helpers that generate the import regex and file-watcher glob from that list — so adding LESS later is one entry. `scss-index.ts` uses postcss + postcss-scss to walk rules, resolve `&` nesting, strip `:global()` / keep `:local()`, unwrap `@media`/`@at-root`, explode group selectors, skip `@keyframes`, and emit `SelectorInfo` records with last-wins cascade semantics. `StyleIndexCache` is an LRU keyed by `(filePath, contentHash)`.

**Tech Stack:** typescript@^6.0.2 · postcss@^8.5.9 · postcss-scss@^4.0.9 · vitest@^4.1.3 · @css-module-explainer/shared

---

## Spec References

- Spec section 3.2 (`scss/lang-registry.ts`)
- Spec section 3.3 (`scss/scss-index.ts`)
- Q6 B decision — which edge cases are in / out
- Q2 B decision — scope is SCSS + CSS; LESS slot reserved but not implemented
- Design section 2.2 layering rules — `scss/` may not import from `cx/`, `ts/`, `indexing/`

## End State (definition of done)

- `server/src/core/scss/lang-registry.ts` exports `STYLE_LANGS`, `findLangForPath`, `getAllStyleExtensions`, `buildStyleImportRegex`, `buildStyleFileWatcherGlob`.
- `server/src/core/scss/scss-index.ts` exports `parseStyleModule`, `StyleIndexCache`.
- `shared/src/types.ts` extended with `SelectorInfo`, `ScssClassMap`, `StyleLang`.
- `server/package.json` adds `postcss@^8.5.9`, `postcss-scss@^4.0.9`.
- Q6 B edge cases have dedicated unit tests, each tagged `(Q6 B #N)` for traceability.
- `pnpm test` passes (smoke + new tests).
- `pnpm check` passes (lint + format:check + typecheck).
- `pnpm build` passes.

---

## File Structure

```
shared/src/
  types.ts                 # Extend with SelectorInfo, ScssClassMap, StyleLang
server/src/core/scss/
  lang-registry.ts         # StyleLang registry + helpers
  scss-index.ts            # parseStyleModule + walkRules + StyleIndexCache
server/package.json        # Add postcss + postcss-scss deps
test/unit/scss/
  lang-registry.test.ts    # Registry + helper tests
  scss-index.test.ts       # Q6 B edge case tests (15+ cases)
```

The smoke test at `test/unit/_smoke.test.ts` stays until Plan 03 (first replacement with real cx-binding-detector tests).

---

## Working Directory

All commands from `/Users/yongseok/dev/css-module-explainer/`.

---

## Task 1.1: Extend shared types with style-language primitives

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Add the new types to `shared/src/types.ts`**

Append below the existing `Position`/`Range` definitions:

```ts
/** Style language descriptor — one entry per `.module.<ext>` target. */
export interface StyleLang {
  readonly id: "scss" | "css";
  readonly extensions: readonly string[];
  readonly syntax: unknown; // postcss.Syntax | null at runtime; widened to unknown here to keep shared runtime-free
  readonly displayName: string;
}

/** A single class selector recovered from a CSS Module. */
export interface SelectorInfo {
  /** Resolved class name (e.g. `button--primary` after `&` nesting). */
  readonly name: string;
  /** Position of the class token within the source file. */
  readonly range: Range;
  /** Original selector string (e.g. `.button:hover .indicator`). */
  readonly fullSelector: string;
  /** Flattened declarations text (e.g. `color: red; font-size: 14px`). */
  readonly declarations: string;
  /** Full `{ ... }` rule block, used by peek views. */
  readonly ruleRange: Range;
}

/** Immutable map from class name to its info, produced per style file. */
export type ScssClassMap = ReadonlyMap<string, SelectorInfo>;
```

Rationale notes for the reader (inline philosophy check):
- `StyleLang.syntax` is `unknown` because `shared` must stay runtime-free (Layer 3 rule). The consumer in `server/` will narrow it back to `postcss.Syntax | null` at the boundary.
- `SelectorInfo.name` carries the resolved name, not the raw token — "what the user wrote in their TSX is what lives in the map."
- `ScssClassMap` is a `ReadonlyMap` alias, not a wrapper class. Kent-Beck simple design: the shape is the API.

- [ ] **Step 2: Re-export from `shared/src/index.ts`**

Replace the current single-line re-export with:

```ts
export type {
  Position,
  Range,
  StyleLang,
  SelectorInfo,
  ScssClassMap,
} from "./types.js";
```

- [ ] **Step 3: Verify shared still typechecks**

Run:

```bash
pnpm typecheck
```

Expected: exit 0. If TypeScript complains about `unknown`-typed syntax field, that's the intended trade-off — the type is ratified here.

- [ ] **Step 4: Commit**

```bash
git add shared/src/
git commit -m "$(cat <<'EOF'
feat(shared): add StyleLang, SelectorInfo, ScssClassMap types

These types are the contract between the scss-index parser (lives
in server/src/core/scss/) and its consumers (providers, future
reverse-index). StyleLang.syntax is intentionally typed as
`unknown` in shared so the type module stays runtime-free; the
server narrows it back to postcss.Syntax | null at the boundary.
EOF
)"
```

---

## Task 1.2: Add postcss dependencies to the server package

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Add dependencies**

Edit `server/package.json` to insert the two new deps alphabetically within the `dependencies` block:

```json
{
  "name": "@css-module-explainer/server",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/server.js",
  "scripts": {
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@css-module-explainer/shared": "workspace:*",
    "postcss": "^8.5.9",
    "postcss-scss": "^4.0.9",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: pnpm resolves postcss and postcss-scss, updates `pnpm-lock.yaml`.

- [ ] **Step 3: Commit lockfile + manifest together**

```bash
git add server/package.json pnpm-lock.yaml
git commit -m "build(server): add postcss and postcss-scss deps for SCSS indexing"
```

---

## Task 1.3: `lang-registry.ts` — registry + helpers

**Files:**
- Create: `server/src/core/scss/lang-registry.ts`
- Create: `test/unit/scss/lang-registry.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `test/unit/scss/lang-registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  STYLE_LANGS,
  findLangForPath,
  getAllStyleExtensions,
  buildStyleImportRegex,
  buildStyleFileWatcherGlob,
} from "../../../server/src/core/scss/lang-registry.js";

describe("STYLE_LANGS registry", () => {
  it("contains exactly scss and css in 1.0", () => {
    expect(STYLE_LANGS.map((l) => l.id)).toEqual(["scss", "css"]);
  });

  it("each entry has at least one extension starting with .module.", () => {
    for (const lang of STYLE_LANGS) {
      expect(lang.extensions.length).toBeGreaterThan(0);
      for (const ext of lang.extensions) {
        expect(ext.startsWith(".module.")).toBe(true);
      }
    }
  });
});

describe("getAllStyleExtensions", () => {
  it("returns every extension across every lang", () => {
    const exts = getAllStyleExtensions();
    expect(exts).toContain(".module.scss");
    expect(exts).toContain(".module.css");
  });

  it("has no duplicates", () => {
    const exts = getAllStyleExtensions();
    expect(new Set(exts).size).toBe(exts.length);
  });
});

describe("findLangForPath", () => {
  it("matches .module.scss to scss", () => {
    expect(findLangForPath("/abs/path/Button.module.scss")?.id).toBe("scss");
  });

  it("matches .module.css to css", () => {
    expect(findLangForPath("/abs/path/Form.module.css")?.id).toBe("css");
  });

  it("returns null for plain .scss (not a CSS module)", () => {
    expect(findLangForPath("/abs/path/_variables.scss")).toBeNull();
  });

  it("returns null for plain .css", () => {
    expect(findLangForPath("/abs/path/reset.css")).toBeNull();
  });

  it("returns null for unrelated files", () => {
    expect(findLangForPath("/abs/path/Button.tsx")).toBeNull();
  });
});

describe("buildStyleImportRegex", () => {
  it("matches an scss module import", () => {
    const re = buildStyleImportRegex();
    const match = re.exec(`import styles from './Button.module.scss';`);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("styles");
    expect(match?.[2]).toBe("./Button.module.scss");
  });

  it("matches a css module import", () => {
    const re = buildStyleImportRegex();
    const match = re.exec(`import css from "../styles/Form.module.css";`);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("css");
    expect(match?.[2]).toBe("../styles/Form.module.css");
  });

  it("does not match a non-module style import", () => {
    const re = buildStyleImportRegex();
    expect(re.exec(`import './reset.css';`)).toBeNull();
  });

  it("is a fresh regex on every call (no lastIndex leaking)", () => {
    const a = buildStyleImportRegex();
    const b = buildStyleImportRegex();
    expect(a).not.toBe(b);
  });
});

describe("buildStyleFileWatcherGlob", () => {
  it("produces a glob that mentions both scss and css", () => {
    const glob = buildStyleFileWatcherGlob();
    expect(glob).toMatch(/scss/);
    expect(glob).toMatch(/css/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test
```

Expected: `Cannot find module '.../lang-registry.js'` — the file does not exist yet.

- [ ] **Step 3: Implement `lang-registry.ts`**

Create `server/src/core/scss/lang-registry.ts`:

```ts
import type { StyleLang } from "@css-module-explainer/shared";
import postcssScss from "postcss-scss";

/**
 * Immutable list of every style language this extension understands.
 *
 * Adding a new language (e.g. LESS in 1.1+) is one new entry plus importing
 * its postcss syntax. No other file in the project hard-codes an extension
 * or a syntax — they all read from this list via the helpers below.
 */
export const STYLE_LANGS: readonly StyleLang[] = [
  {
    id: "scss",
    extensions: [".module.scss"],
    syntax: postcssScss,
    displayName: "SCSS",
  },
  {
    id: "css",
    extensions: [".module.css"],
    syntax: null, // vanilla postcss
    displayName: "CSS",
  },
] as const;

/** Flat list of every `.module.<ext>` this project indexes. */
export function getAllStyleExtensions(): readonly string[] {
  return STYLE_LANGS.flatMap((lang) => lang.extensions);
}

/** Pick the lang entry for a file path, or null if unrelated. */
export function findLangForPath(filePath: string): StyleLang | null {
  for (const lang of STYLE_LANGS) {
    for (const ext of lang.extensions) {
      if (filePath.endsWith(ext)) {
        return lang;
      }
    }
  }
  return null;
}

/**
 * Build the regex used by cx-binding-detector to spot style imports:
 *   import styles from './Button.module.scss';
 *
 * Capture groups:
 *   [1] → the default-import identifier ('styles')
 *   [2] → the module specifier ('./Button.module.scss')
 *
 * Returns a fresh regex per call so callers are not exposed to
 * stateful `lastIndex` sharing from `/g` flag leaks.
 */
export function buildStyleImportRegex(): RegExp {
  const exts = getAllStyleExtensions()
    .map((ext) => ext.replace(/\./g, "\\."))
    .join("|");
  return new RegExp(
    String.raw`import\s+(\w+)\s+from\s+['"]([^'"]+(?:${exts}))['"]`,
  );
}

/**
 * Build the `workspace/didChangeWatchedFiles` glob pattern.
 * Example output: `**\/\*.module.{scss,css}`
 */
export function buildStyleFileWatcherGlob(): string {
  const stems = STYLE_LANGS.flatMap((lang) =>
    lang.extensions.map((ext) => ext.replace(/^\.module\./, "")),
  );
  return `**/*.module.{${stems.join(",")}}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: lang-registry tests all pass, smoke test still passes.

- [ ] **Step 5: Run the full check pipeline**

```bash
pnpm check
```

Expected: lint + format:check + typecheck all green. If format:check fails, run `pnpm format` then re-run check.

- [ ] **Step 6: Commit**

```bash
git add server/src/core/scss/lang-registry.ts test/unit/scss/lang-registry.test.ts
git commit -m "$(cat <<'EOF'
feat(scss): add style-language registry with scss and css entries

server/src/core/scss/lang-registry.ts is the single source of
truth for which file extensions this extension indexes. Adding
LESS in 1.1+ is a one-entry diff plus a postcss-less dependency;
no other file in the tree hard-codes an extension.

Helpers derived from the registry:
- getAllStyleExtensions() — flat list for display and tests
- findLangForPath(path) — path → lang or null
- buildStyleImportRegex() — cx-binding-detector's import matcher,
  generated fresh on every call to avoid lastIndex leaks
- buildStyleFileWatcherGlob() — LSP file-watcher registration glob

Test matrix covers: registry contents, dedupe, path matching
for .module.scss/.module.css, negative cases (plain .scss,
plain .css, .tsx), import regex capture groups, fresh-regex
guarantee, and watcher glob content.
EOF
)"
```

---

## Task 1.4: `scss-index.ts` basic parser — extract flat classes

**Files:**
- Create: `server/src/core/scss/scss-index.ts`
- Create: `test/unit/scss/scss-index.test.ts`

This task lands the parser skeleton plus the simplest case (flat `.foo { ... }` selectors). Q6 B edge cases come in Task 1.5.

- [ ] **Step 1: Write the failing test first**

Create `test/unit/scss/scss-index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStyleModule } from "../../../server/src/core/scss/scss-index.js";

describe("parseStyleModule / flat classes", () => {
  it("extracts a single flat class", () => {
    const map = parseStyleModule(
      `.button { color: red; padding: 8px; }`,
      "/fake/a.module.scss",
    );
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
    // Unterminated block — postcss should throw; parser must catch.
    const map = parseStyleModule(`.broken { color: `, "/fake/a.module.scss");
    expect(map.size).toBe(0);
  });

  it("uses vanilla postcss for .module.css (no SCSS syntax)", () => {
    const map = parseStyleModule(
      `.plain { color: red; }`,
      "/fake/a.module.css",
    );
    expect(map.has("plain")).toBe(true);
  });

  it("records the class token range (0-based)", () => {
    const map = parseStyleModule(
      `.indicator { color: red; }`,
      "/fake/a.module.scss",
    );
    const info = map.get("indicator")!;
    // ".indicator" starts at col 0; the class name 'indicator' starts at col 1
    expect(info.range.start.line).toBe(0);
    expect(info.range.start.character).toBe(1);
    expect(info.range.end.character).toBe(1 + "indicator".length);
  });

  it("records the full rule block range (ruleRange)", () => {
    const map = parseStyleModule(
      `.indicator {\n  color: red;\n}`,
      "/fake/a.module.scss",
    );
    const info = map.get("indicator")!;
    expect(info.ruleRange.start.line).toBe(0);
    expect(info.ruleRange.end.line).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test
```

Expected: `Cannot find module '.../scss-index.js'`.

- [ ] **Step 3: Implement the parser**

Create `server/src/core/scss/scss-index.ts`:

```ts
import type {
  Position,
  Range,
  SelectorInfo,
  ScssClassMap,
} from "@css-module-explainer/shared";
import postcss, { type Rule, type Declaration } from "postcss";
import { findLangForPath } from "./lang-registry.js";

/**
 * Parse a CSS Module file into a map of class name → SelectorInfo.
 *
 * Parsing is best-effort: a parse error produces an empty map, never
 * throws. The caller (StyleIndexCache) treats an empty map as a
 * legitimate "no classes found" result, so upstream providers keep
 * running even when one file is broken.
 */
export function parseStyleModule(
  content: string,
  filePath: string,
): ScssClassMap {
  const classMap = new Map<string, SelectorInfo>();

  const lang = findLangForPath(filePath);
  // Use the registered syntax if we know the lang, else fall back
  // to vanilla postcss — which also handles plain `.module.css`
  // correctly because it's a strict subset of SCSS.
  const syntax = (lang?.syntax ?? undefined) as
    | Parameters<typeof postcss>[0] extends infer _
      ? Parameters<(typeof postcss)["prototype"]["process"]>[1]
      : never; // widened below
  let root;
  try {
    // postcss' TS types expect a specific Syntax shape; our shared
    // StyleLang.syntax is typed as `unknown` on purpose, so we
    // narrow locally here.
    root = postcss().process(content, {
      from: filePath,
      syntax: (lang?.syntax ?? undefined) as
        | postcss.Syntax
        | undefined,
    }).root;
  } catch {
    return classMap;
  }

  walkRules(root.nodes, classMap);
  return classMap;
}

function walkRules(
  nodes: postcss.ChildNode[] | undefined,
  classMap: Map<string, SelectorInfo>,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type === "rule") {
      recordRule(node, classMap);
      // Nested rules under the current rule's own children are
      // visited as part of SCSS-style nesting in Task 1.5.
    } else if (node.type === "atrule" && isTransparentAtRule(node.name)) {
      // @media / @at-root: walk through, collecting inner rules as
      // if the wrapper were not there. Covered by Task 1.5 tests.
      walkRules(node.nodes, classMap);
    }
  }
}

function isTransparentAtRule(name: string): boolean {
  return name === "media" || name === "at-root" || name === "supports";
}

function recordRule(
  rule: Rule,
  classMap: Map<string, SelectorInfo>,
): void {
  const selectors = rule.selectors ?? [rule.selector];
  const declarations = collectDeclarations(rule);
  const ruleRange = rangeForRule(rule);

  for (const raw of selectors) {
    for (const className of extractClassNames(raw)) {
      const tokenRange = findTokenRange(rule, className, raw);
      classMap.set(className, {
        name: className,
        range: tokenRange,
        fullSelector: raw.trim(),
        declarations,
        ruleRange,
      });
    }
  }
}

function collectDeclarations(rule: Rule): string {
  const parts: string[] = [];
  rule.walkDecls((decl: Declaration) => {
    parts.push(`${decl.prop}: ${decl.value}`);
  });
  return parts.join("; ");
}

/**
 * Extract the class names that a raw selector string would expose on
 * the CSS-Modules `styles` object. In Task 1.4 this only handles
 * simple `.foo` patterns; `:global()`, `&` nesting, and groups
 * come in Task 1.5.
 */
function extractClassNames(rawSelector: string): string[] {
  // Strip everything that is not part of a class token: pseudo
  // classes/elements, element names, combinators, whitespace.
  const withoutPseudos = rawSelector.replace(/::?[a-zA-Z-]+(?:\([^)]*\))?/g, "");
  const classMatches = withoutPseudos.match(/\.[a-zA-Z_][\w-]*/g) ?? [];
  if (classMatches.length === 0) return [];
  // For Task 1.4, record only the *last* class token in the
  // selector, matching how CSS Modules exposes deeply-nested classes.
  // Group selectors (".a, .b") are handled in Task 1.5.
  const last = classMatches[classMatches.length - 1]!;
  return [last.slice(1)]; // drop leading '.'
}

function findTokenRange(
  rule: Rule,
  className: string,
  _rawSelector: string,
): Range {
  // postcss source locations are 1-based.
  const start = rule.source?.start;
  if (!start) {
    return zeroRange();
  }
  const line = start.line - 1;
  // Find the class name offset inside the selector string.
  const selectorText = rule.selector ?? "";
  const dotted = `.${className}`;
  const offset = selectorText.indexOf(dotted);
  const character = (start.column - 1) + (offset >= 0 ? offset + 1 : 0);
  return {
    start: { line, character },
    end: { line, character: character + className.length },
  };
}

function rangeForRule(rule: Rule): Range {
  const start = rule.source?.start;
  const end = rule.source?.end;
  return {
    start: start
      ? { line: start.line - 1, character: start.column - 1 }
      : { line: 0, character: 0 },
    end: end
      ? { line: end.line - 1, character: end.column - 1 }
      : { line: 0, character: 0 },
  };
}

function zeroRange(): Range {
  const zero: Position = { line: 0, character: 0 };
  return { start: zero, end: zero };
}
```

> **Note on the `syntax` narrowing dance:** `shared/StyleLang.syntax` is `unknown` (Layer 3 rule — shared is runtime-free). Inside `parseStyleModule` we cast it back to `postcss.Syntax | undefined` at the actual usage site. This is the designed narrowing boundary; it lives in exactly one place.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: the 7 new tests in Task 1.4's test file all pass, plus the smoke test and lang-registry tests.

- [ ] **Step 5: Full check pipeline**

```bash
pnpm check
```

Expected: lint + format:check + typecheck all green. If format:check fails, run `pnpm format` and re-run.

- [ ] **Step 6: Commit**

```bash
git add server/src/core/scss/scss-index.ts test/unit/scss/scss-index.test.ts
git commit -m "$(cat <<'EOF'
feat(scss): parse flat class selectors into a ScssClassMap

server/src/core/scss/scss-index.ts ships parseStyleModule, a
best-effort postcss walker that:

- picks the syntax from lang-registry (postcss-scss for .scss,
  vanilla postcss for .css)
- walks top-level rules and @media / @at-root / @supports
  wrappers transparently
- records the last class token of each selector along with its
  source range, the full rule block range, and a flat
  declarations string

Parse errors produce an empty map rather than throwing, so a
single broken file never halts indexing.

Q6 B edge cases (:global, :local, & nesting, group selectors,
cascade last-wins, @keyframes exclusion, CSS variables in
hover) land in Task 1.5.
EOF
)"
```

---

## Task 1.5: Q6 B edge cases — the real shape of SCSS indexing

**Files:**
- Modify: `server/src/core/scss/scss-index.ts`
- Modify: `test/unit/scss/scss-index.test.ts`

This task brings the parser up to "production-complete" per the Q6 B decision.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/scss/scss-index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStyleModule } from "../../../server/src/core/scss/scss-index.js";

describe("parseStyleModule / Q6 B edge cases", () => {
  describe(":global() wrapping (Q6 B #1)", () => {
    it("excludes :global(.foo) from the class map", () => {
      const map = parseStyleModule(
        `:global(.btn) { color: red; }`,
        "/fake/a.module.scss",
      );
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

  describe(":local() wrapping (Q6 B #2)", () => {
    it("includes :local(.foo) as 'foo'", () => {
      const map = parseStyleModule(
        `:local(.btn) { color: red; }`,
        "/fake/a.module.scss",
      );
      expect(map.has("btn")).toBe(true);
    });
  });

  describe("& nesting (Q6 B #4)", () => {
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
      const map = parseStyleModule(
        `.wrapper { .inner { color: red; } }`,
        "/fake/a.module.scss",
      );
      // Only 'inner' is exposed on the styles object (last class wins).
      expect(map.has("inner")).toBe(true);
    });
  });

  describe("group selectors (Q6 B #6)", () => {
    it("indexes each class in '.a, .b'", () => {
      const map = parseStyleModule(
        `.primary, .secondary { color: red; }`,
        "/fake/a.module.scss",
      );
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

  describe("CSS variables (Q6 B #7)", () => {
    it("includes --var-name declarations in the declarations text", () => {
      const map = parseStyleModule(
        `.theme { --bg: red; --fg: white; }`,
        "/fake/a.module.scss",
      );
      expect(map.get("theme")!.declarations).toContain("--bg: red");
      expect(map.get("theme")!.declarations).toContain("--fg: white");
    });
  });

  describe("cascade last-wins (Q6 B #8)", () => {
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

  describe("@keyframes / @font-face exclusion (Q6 B #9)", () => {
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

  describe("@media / @at-root unwrapping (Q6 B #10)", () => {
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
```

- [ ] **Step 2: Run tests to verify failures**

```bash
pnpm test
```

Expected: most Q6 B tests fail because the Task 1.4 parser does not yet handle `:global`, `:local`, `&`, group selectors, cascade, or nested rules properly.

- [ ] **Step 3: Extend the parser to cover the edge cases**

Replace the body of `server/src/core/scss/scss-index.ts` with the full implementation:

```ts
import type {
  Range,
  SelectorInfo,
  ScssClassMap,
} from "@css-module-explainer/shared";
import postcss, { type Rule, type Declaration, type ChildNode } from "postcss";
import { findLangForPath } from "./lang-registry.js";

export function parseStyleModule(
  content: string,
  filePath: string,
): ScssClassMap {
  const classMap = new Map<string, SelectorInfo>();

  const lang = findLangForPath(filePath);
  let root;
  try {
    root = postcss().process(content, {
      from: filePath,
      syntax: (lang?.syntax ?? undefined) as postcss.Syntax | undefined,
    }).root;
  } catch {
    return classMap;
  }

  walkRules(root.nodes, "", classMap);
  return classMap;
}

/**
 * Walk postcss child nodes and record every class that CSS Modules
 * would expose on the `styles` object.
 *
 * - `parentSelector` carries the resolved selector chain for SCSS
 *   `&` nesting. `` at the top level.
 * - `@media` / `@at-root` / `@supports` are transparent wrappers:
 *   we recurse into their bodies with the current parent intact.
 * - `@keyframes`, `@font-face`, and any other at-rule are NOT
 *   transparent — their children are not class selectors in the
 *   CSS-Modules sense.
 */
function walkRules(
  nodes: ChildNode[] | undefined,
  parentSelector: string,
  classMap: Map<string, SelectorInfo>,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type === "rule") {
      recordRule(node, parentSelector, classMap);
    } else if (node.type === "atrule" && isTransparentAtRule(node.name)) {
      walkRules(node.nodes, parentSelector, classMap);
    }
  }
}

function isTransparentAtRule(name: string): boolean {
  return name === "media" || name === "at-root" || name === "supports";
}

function recordRule(
  rule: Rule,
  parentSelector: string,
  classMap: Map<string, SelectorInfo>,
): void {
  const declarations = collectOwnDeclarations(rule);
  const ruleRange = rangeForRule(rule);

  // Each comma-separated selector produces its own entry.
  const selectors = rule.selectors ?? [rule.selector];
  const resolvedSelectors: string[] = [];

  for (const raw of selectors) {
    const resolved = resolveSelector(raw, parentSelector);
    resolvedSelectors.push(resolved);

    for (const className of extractClassNames(resolved)) {
      const tokenRange = findTokenRange(rule, className, raw);
      // Q6 B #8 — cascade last-wins: .set() overwrites.
      classMap.set(className, {
        name: className,
        range: tokenRange,
        fullSelector: resolved,
        declarations,
        ruleRange,
      });
    }
  }

  // Recurse into nested rules using each resolved selector as the
  // new parent. A rule with grouped selectors uses the first one
  // as parent for nested children, matching SCSS semantics.
  const nextParent = resolvedSelectors[0] ?? parentSelector;
  walkRules(rule.nodes, nextParent, classMap);
}

function collectOwnDeclarations(rule: Rule): string {
  // Only collect declarations that belong directly to this rule,
  // not nested rules. CSS variables (--name) are included — they
  // show up in hover cards.
  const parts: string[] = [];
  for (const child of rule.nodes ?? []) {
    if (child.type === "decl") {
      const d = child as Declaration;
      parts.push(`${d.prop}: ${d.value}`);
    }
  }
  return parts.join("; ");
}

/**
 * Resolve a raw selector against its parent selector the way SCSS
 * does:
 *   parent ".button", raw "&--primary" → ".button--primary"
 *   parent ".card",   raw ".inner"      → ".card .inner"
 *   parent "",        raw ".top"        → ".top"
 */
function resolveSelector(raw: string, parent: string): string {
  const trimmed = raw.trim();
  if (parent === "") return trimmed;
  if (trimmed.includes("&")) {
    return trimmed.replace(/&/g, parent);
  }
  return `${parent} ${trimmed}`;
}

/**
 * Extract class names that CSS Modules would expose on the styles
 * object for a resolved selector.
 *
 * Rules:
 *   - `:global(.x)` wraps are stripped and the inner class is NOT
 *     recorded (it does not appear on the styles object).
 *   - `:local(.x)` wraps are stripped and the inner class IS
 *     recorded.
 *   - Other pseudo-classes/elements (:hover, ::before) are stripped
 *     from the name but don't change inclusion.
 *   - Only the LAST class in a compound/descendant selector is
 *     exposed on `styles` — that's the name the user imports.
 *     Each class in a group selector (".a, .b") is a separate
 *     call to this function, so grouping is handled upstream.
 */
function extractClassNames(resolvedSelector: string): string[] {
  // Drop :global(...) blocks entirely — including their class names.
  const withoutGlobal = resolvedSelector.replace(
    /:global\s*\(\s*[^)]*\)/g,
    "",
  );
  // Strip :local(...) wrappers but keep the inner class.
  const withoutLocal = withoutGlobal.replace(
    /:local\s*\(\s*([^)]*)\s*\)/g,
    "$1",
  );
  // Remove pseudo-classes/elements that aren't wrappers
  // (:hover, ::before, :nth-child(2n), etc.).
  const withoutPseudos = withoutLocal.replace(
    /::?[a-zA-Z-]+(?:\([^)]*\))?/g,
    "",
  );
  const matches = withoutPseudos.match(/\.[a-zA-Z_][\w-]*/g) ?? [];
  if (matches.length === 0) return [];
  const last = matches[matches.length - 1]!;
  return [last.slice(1)];
}

function findTokenRange(
  rule: Rule,
  className: string,
  rawSelector: string,
): Range {
  const start = rule.source?.start;
  if (!start) return zeroRange();
  const line = start.line - 1;
  const dotted = `.${className}`;
  // Search the raw (unresolved) selector first so the character
  // offset matches the text the user wrote.
  const offset = rawSelector.indexOf(dotted);
  const baseCol = start.column - 1;
  const character = offset >= 0 ? baseCol + offset + 1 : baseCol;
  return {
    start: { line, character },
    end: { line, character: character + className.length },
  };
}

function rangeForRule(rule: Rule): Range {
  const start = rule.source?.start;
  const end = rule.source?.end;
  return {
    start: start
      ? { line: start.line - 1, character: start.column - 1 }
      : { line: 0, character: 0 },
    end: end
      ? { line: end.line - 1, character: end.column - 1 }
      : { line: 0, character: 0 },
  };
}

function zeroRange(): Range {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
pnpm test
```

Expected: every Q6 B test passes along with the Task 1.4 basic tests and the smoke/lang-registry tests.

- [ ] **Step 5: Full check pipeline**

```bash
pnpm check
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add server/src/core/scss/scss-index.ts test/unit/scss/scss-index.test.ts
git commit -m "$(cat <<'EOF'
feat(scss): handle Q6 B edge cases in parseStyleModule

The parser now produces the production-correct ScssClassMap per
the design spec's Q6 B decision. Each edge case has a dedicated
test block tagged (Q6 B #N):

- :global(.x) wrappers are stripped along with their inner class
  — :global names do not appear on the CSS Modules `styles`
  object, so we do not index them.
- :local(.x) wrappers are stripped but the inner class is kept.
- SCSS `&` nesting is resolved against the enclosing parent chain,
  so `.button { &--primary { ... } }` becomes 'button--primary'.
- Group selectors ('.a, .b { ... }') index each class with the
  same declarations and rule block.
- CSS variable declarations ('--bg: red') are included in the
  declarations text for hover display.
- Cascade is last-wins: a class redefined later overwrites the
  earlier entry.
- @keyframes, @font-face, and other non-rule at-rules are not
  descended into (their inner identifiers are not class tokens).
- @media, @at-root, @supports are transparent wrappers — their
  bodies are walked as if the wrapper were not present.

The parser still returns an empty map on parse error and never
throws.
EOF
)"
```

---

## Task 1.6: `StyleIndexCache` — content-hash LRU

**Files:**
- Modify: `server/src/core/scss/scss-index.ts`
- Modify: `test/unit/scss/scss-index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/scss/scss-index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { StyleIndexCache } from "../../../server/src/core/scss/scss-index.js";

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
    const b = cache.get("/b.module.scss", `.b{}`);
    // LRU order: a, b
    cache.get("/a.module.scss", `.a{}`); // touch a → order: b, a
    cache.get("/c.module.scss", `.c{}`); // evicts b
    const aAgain = cache.get("/a.module.scss", `.a{}`);
    expect(aAgain).toBe(a);
    const bAgain = cache.get("/b.module.scss", `.b{}`);
    expect(bAgain).not.toBe(b); // b was evicted, re-parsed
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm test
```

Expected: `StyleIndexCache is not exported` or similar.

- [ ] **Step 3: Implement `StyleIndexCache`**

Append to `server/src/core/scss/scss-index.ts`:

```ts
import * as crypto from "node:crypto";

interface StyleIndexCacheEntry {
  hash: string;
  classMap: ScssClassMap;
}

/**
 * Content-hashed LRU cache for parseStyleModule results.
 *
 * - Hit path: provider asks for a file + its current content, we
 *   compute md5 once and return the cached ScssClassMap by
 *   reference identity.
 * - Miss path: we call parseStyleModule, store the result, and
 *   return it.
 * - Eviction: plain Map insertion order + size bound; a hit also
 *   moves the entry to the end of the order to stay "warm".
 */
export class StyleIndexCache {
  private readonly entries = new Map<string, StyleIndexCacheEntry>();
  private readonly max: number;

  constructor(options: { max: number }) {
    this.max = options.max;
  }

  get(filePath: string, content: string): ScssClassMap {
    const hash = md5(content);
    const cached = this.entries.get(filePath);
    if (cached && cached.hash === hash) {
      // Touch: re-insert to move to the end (MRU).
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

function md5(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: StyleIndexCache tests pass; everything else still green.

- [ ] **Step 5: Full check pipeline**

```bash
pnpm check && pnpm test && pnpm build
```

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/core/scss/scss-index.ts test/unit/scss/scss-index.test.ts
git commit -m "$(cat <<'EOF'
feat(scss): add StyleIndexCache — content-hashed LRU

StyleIndexCache wraps parseStyleModule with:

- md5(content) keyed hit detection, so providers can call
  cache.get(path, content) on every request and get reference
  equality on unchanged files
- LRU eviction capped at the configured `max` (default 500 in
  the composition root), with touch-on-hit so active files
  stay warm
- invalidate(path) for file-watcher events
- clear() for workspace-level resets (e.g. tsconfig change)

This closes out Plan 02's Task 1.6 and completes Phase 1 of
the design spec: parseStyleModule, StyleIndexCache, Q6 B edge
cases, and lang-registry are all in place.
EOF
)"
```

---

## Plan 02 Completion Checklist

- [ ] `pnpm test` reports the smoke test plus all new lang-registry and scss-index tests passing.
- [ ] `pnpm check` is green.
- [ ] `pnpm build` produces both bundles (unchanged from Plan 01, since Phase 1 code is unused by providers yet).
- [ ] `shared/src/types.ts` exposes `StyleLang`, `SelectorInfo`, `ScssClassMap` alongside `Position`/`Range`.
- [ ] `server/src/core/scss/lang-registry.ts` exists with immutable `STYLE_LANGS` and helpers.
- [ ] `server/src/core/scss/scss-index.ts` exists with `parseStyleModule` + `StyleIndexCache`.
- [ ] `test/unit/scss/lang-registry.test.ts` covers every public helper.
- [ ] `test/unit/scss/scss-index.test.ts` covers flat classes, `:global`, `:local`, `&` nesting, group selectors, CSS variables, cascade last-wins, `@keyframes` exclusion, `@media`/`@at-root` unwrapping, parse error tolerance, and StyleIndexCache semantics.
- [ ] Every Q6 B test is tagged `(Q6 B #N)` in its describe title.
- [ ] No imports cross the `scss/` → `cx/`, `ts/`, or `indexing/` boundary (Phase 1 is self-contained).
- [ ] `git log --oneline` shows the expected 6 Plan 02 commits on top of Plan 01.

When every item is checked, Plan 02 is complete. Proceed to Plan 03 (cx-binding-detector + cx-call-parser).
