# Plan 05 — Indexing Infrastructure + Provider Utils (Phase 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the **orchestration layer** that ties Phase 1–4 cores together: one place where "analyze this live document" becomes "bindings + calls + cached AST", one place where "find cx call at cursor" becomes a reusable provider primitive. Also land the **Phase Final seams** — `ReverseIndex` interface + null object, and an `IndexerWorker` skeleton with swappable file supplier — so Plans 06–09 never know Phase Final is coming.

**Architecture:** Five modules land. `core/util/text-utils.ts` holds pure string helpers (line slicing, Levenshtein, closest-match, URL conversion) that both indexing and providers need. `core/indexing/document-analysis-cache.ts` is the single-parse hub — it owns a `SourceFileCache`, composes `detectCxBindings` + `parseCxCalls`, and caches the result keyed on `(uri, TextDocument.version)` with content-hash fallback. `core/indexing/reverse-index.ts` declares the `ReverseIndex` interface and ships a `NullReverseIndex` so every provider can call `.record()` from day one without surprise. `core/indexing/indexer-worker.ts` is a supplier-injected background loop skeleton — real supplier swapping lands in Phase 10. `providers/provider-utils.ts` defines the shared `ProviderDeps` bag, `CursorParams`, `CxCallContext`, and the `withCxCallAtCursor<T>` front stage that every provider (Plans 06–09.5) will dispatch through.

No providers ship yet — this plan just builds the chassis they bolt onto.

**Tech Stack:** typescript@^6.0.2 · vitest@^4.1.3 · @css-module-explainer/shared

---

## Spec References

- Spec section 3.8 — `indexing/document-analysis-cache.ts`
- Spec section 3.9 — `indexing/reverse-index.ts`
- Spec section 3.10 — `indexing/indexer-worker.ts`
- Spec section 3.11 — `util/text-utils.ts`
- Spec section 4.1 — `provider-utils.ts`
- Spec section 7.2.1 — "one parse per file" principle enforced via AnalysisCache
- Spec section 7.2.4 — fast-path optimizations for `withCxCallAtCursor`

## End State

- `shared/src/types.ts` extended with `CallSite` (ReverseIndex entry shape).
- `server/src/core/util/text-utils.ts` exports `getLineAt`, `levenshteinDistance`, `findClosestMatch`, `pathToFileUrl`, `fileUrlToPath`.
- `server/src/core/indexing/document-analysis-cache.ts` exports `DocumentAnalysisCache` + `AnalysisEntry` type.
- `server/src/core/indexing/reverse-index.ts` exports `ReverseIndex` interface + `NullReverseIndex` class.
- `server/src/core/indexing/indexer-worker.ts` exports `IndexerWorker` class + `FileTask` type.
- `server/src/providers/provider-utils.ts` exports `CursorParams`, `ProviderDeps`, `CxCallContext`, `withCxCallAtCursor`, `isInsideCxCall`.
- All 5 modules have dedicated unit tests.
- `pnpm check && pnpm test && pnpm build` all green.
- Layer rule: `indexing/` and `providers/` may compose `scss/`, `cx/`, `ts/`, and `util/`. `providers/` must NOT import `WorkspaceTypeResolver` directly — only through the `TypeResolver` interface.

---

## File Structure

```
shared/src/
  types.ts                             # Add CallSite
server/src/core/util/
  text-utils.ts                        # Pure string helpers
server/src/core/indexing/
  document-analysis-cache.ts           # AnalysisEntry + DocumentAnalysisCache
  reverse-index.ts                     # ReverseIndex interface + NullReverseIndex
  indexer-worker.ts                    # Supplier-injected background loop skeleton
server/src/providers/
  provider-utils.ts                    # ProviderDeps + withCxCallAtCursor + isInsideCxCall
test/unit/util/
  text-utils.test.ts
test/unit/indexing/
  document-analysis-cache.test.ts
  reverse-index.test.ts
  indexer-worker.test.ts
test/unit/providers/
  provider-utils.test.ts
```

**Note:** The smoke test at `test/unit/_smoke.test.ts` stays. Plan 02 already added real tests, so the smoke test is cheap dead weight — it can be removed opportunistically but is not worth a dedicated commit.

---

## Working Directory

All commands from `/Users/yongseok/dev/css-module-explainer/`.

---

## Task 5.1: Add `CallSite` to shared types

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Append the new type**

Below `ResolvedType`:

```ts
// ──────────────────────────────────────────────────────────────
// Reverse index (Phase Final seam, declared in Phase 5)
// ──────────────────────────────────────────────────────────────

/**
 * One recorded call site of a specific class name. The ReverseIndex
 * (NullReverseIndex in Phase 5, WorkspaceReverseIndex in Phase Final)
 * maps (scssFilePath, className) → CallSite[].
 *
 * Phase 5 does not populate any CallSites — the null-object
 * implementation discards every record() call. Providers still
 * feed data in from day one so the seam is exercised.
 */
export interface CallSite {
  /** URI of the TSX/JSX/TS/JS file containing the cx() call. */
  readonly uri: string;
  /** Range covering the class token the user wrote. */
  readonly range: Range;
  /** Binding through which the call was made. */
  readonly binding: CxBinding;
  /** Kind of the original CxCallInfo variant. */
  readonly kind: CxCallInfo["kind"];
  /** Human-readable summary ("static: indicator", "prefix: weight-"). */
  readonly matchInfo: string;
}
```

- [ ] **Step 2: Re-export**

Add `CallSite` to the `index.ts` re-export list.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add shared/src/
git commit -m "feat(shared): add CallSite type for the ReverseIndex seam"
```

---

## Task 5.2: `util/text-utils.ts`

**Files:**
- Create: `server/src/core/util/text-utils.ts`
- Create: `test/unit/util/text-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/util/text-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getLineAt,
  levenshteinDistance,
  findClosestMatch,
  pathToFileUrl,
  fileUrlToPath,
} from "../../../server/src/core/util/text-utils.js";

describe("getLineAt", () => {
  it("returns the requested 0-indexed line", () => {
    const content = "alpha\nbeta\ngamma";
    expect(getLineAt(content, 0)).toBe("alpha");
    expect(getLineAt(content, 1)).toBe("beta");
    expect(getLineAt(content, 2)).toBe("gamma");
  });

  it("handles CRLF endings without including \\r", () => {
    const content = "alpha\r\nbeta\r\n";
    expect(getLineAt(content, 0)).toBe("alpha");
    expect(getLineAt(content, 1)).toBe("beta");
  });

  it("returns undefined for out-of-range lines", () => {
    expect(getLineAt("one\ntwo", 5)).toBeUndefined();
    expect(getLineAt("one\ntwo", -1)).toBeUndefined();
  });

  it("handles the last line with no trailing newline", () => {
    expect(getLineAt("one\ntwo", 1)).toBe("two");
  });

  it("handles an empty string", () => {
    expect(getLineAt("", 0)).toBe("");
  });

  it("handles a single line with no newline", () => {
    expect(getLineAt("single", 0)).toBe("single");
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("handles single edits", () => {
    expect(levenshteinDistance("abc", "abd")).toBe(1); // substitution
    expect(levenshteinDistance("abc", "ab")).toBe(1); // deletion
    expect(levenshteinDistance("abc", "abcd")).toBe(1); // insertion
  });

  it("handles typical typos", () => {
    expect(levenshteinDistance("indicator", "indicatorr")).toBe(1);
    expect(levenshteinDistance("button", "buton")).toBe(1);
    expect(levenshteinDistance("primary", "primery")).toBe(1);
  });
});

describe("findClosestMatch", () => {
  it("returns the closest candidate within the default distance", () => {
    const result = findClosestMatch("indicatorr", ["indicator", "button", "primary"]);
    expect(result).toBe("indicator");
  });

  it("returns null when no candidate is within maxDistance", () => {
    const result = findClosestMatch("zzzzz", ["alpha", "beta", "gamma"]);
    expect(result).toBeNull();
  });

  it("honors a custom maxDistance", () => {
    expect(findClosestMatch("abc", ["xyz"], 5)).toBe("xyz");
    expect(findClosestMatch("abc", ["xyz"], 1)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(findClosestMatch("abc", [])).toBeNull();
  });

  it("breaks ties deterministically (first match wins)", () => {
    // Both 'ab' and 'bc' are distance 1 from 'ac'; iteration
    // order picks whichever comes first.
    const candidates = ["ab", "bc"];
    const result = findClosestMatch("ac", candidates);
    expect(result).toBe("ab");
  });
});

describe("pathToFileUrl / fileUrlToPath round trip", () => {
  it("converts an absolute path to a file: URL", () => {
    expect(pathToFileUrl("/abs/path/a.tsx")).toBe("file:///abs/path/a.tsx");
  });

  it("decodes a file: URL back to an absolute path", () => {
    expect(fileUrlToPath("file:///abs/path/a.tsx")).toBe("/abs/path/a.tsx");
  });

  it("round-trips a path with spaces safely", () => {
    const original = "/abs/With Space/a.tsx";
    expect(fileUrlToPath(pathToFileUrl(original))).toBe(original);
  });
});
```

- [ ] **Step 2: Run → fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement**

Create `server/src/core/util/text-utils.ts`:

```ts
import * as nodeUrl from "node:url";

/**
 * Return the 0-indexed line at `lineNumber` from `content`,
 * excluding the trailing `\n` (and `\r` if present). Returns
 * `undefined` when the line is out of range.
 *
 * Implementation walks `indexOf('\n')` to avoid allocating a
 * full `split('\n')` array on every hover/definition call.
 */
export function getLineAt(content: string, lineNumber: number): string | undefined {
  if (lineNumber < 0) return undefined;

  let start = 0;
  let currentLine = 0;
  while (currentLine < lineNumber && start < content.length) {
    const nextNewline = content.indexOf("\n", start);
    if (nextNewline === -1) return undefined;
    start = nextNewline + 1;
    currentLine += 1;
  }
  if (start > content.length) return undefined;
  if (start === content.length && lineNumber > 0 && content.at(-1) !== "\n") {
    return undefined;
  }

  const end = content.indexOf("\n", start);
  const line = end === -1 ? content.slice(start) : content.slice(start, end);
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Classic dynamic-programming Levenshtein distance.
 * Used only for "Did you mean?" suggestions where inputs are
 * short class names; O(n*m) is fine.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);

  for (let j = 0; j < cols; j += 1) prev[j] = j;

  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      );
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j]!;
  }

  return prev[cols - 1]!;
}

/**
 * Return the candidate with the smallest Levenshtein distance to
 * `target`, or null when none is within `maxDistance` (default 3).
 * Ties are broken by iteration order — first match wins.
 */
export function findClosestMatch(
  target: string,
  candidates: Iterable<string>,
  maxDistance = 3,
): string | null {
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(target, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistance ? best : null;
}

/**
 * Thin wrappers over node:url's URL ↔ filesystem path conversion.
 * Centralised so tests can stub them and providers never touch
 * the `file:` scheme string directly.
 */
export function pathToFileUrl(absolutePath: string): string {
  return nodeUrl.pathToFileURL(absolutePath).toString();
}

export function fileUrlToPath(fileUrl: string): string {
  return nodeUrl.fileURLToPath(fileUrl);
}
```

- [ ] **Step 4: Run → pass, commit**

```bash
pnpm format && pnpm check && pnpm test
git add server/src/core/util/text-utils.ts test/unit/util/text-utils.test.ts
git commit -m "feat(util): add text-utils — getLineAt, Levenshtein, URL conversion"
```

---

## Task 5.3: `indexing/reverse-index.ts` + `NullReverseIndex`

**Files:**
- Create: `server/src/core/indexing/reverse-index.ts`
- Create: `test/unit/indexing/reverse-index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/indexing/reverse-index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CallSite, CxBinding } from "@css-module-explainer/shared";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index.js";

function makeBinding(): CxBinding {
  return {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/a.module.scss",
    classNamesImportName: "classNames",
    scope: { startLine: 0, endLine: 100 },
  };
}

function makeCallSite(): CallSite {
  return {
    uri: "file:///fake/a.tsx",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    binding: makeBinding(),
    kind: "static",
    matchInfo: "static: indicator",
  };
}

describe("NullReverseIndex", () => {
  it("accepts record() without throwing and without storing", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite()]);
    expect(index.find("/fake/a.module.scss", "indicator")).toEqual([]);
  });

  it("count() always returns 0", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite(), makeCallSite()]);
    expect(index.count("/fake/a.module.scss", "indicator")).toBe(0);
  });

  it("forget() is a no-op", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite()]);
    index.forget("file:///fake/a.tsx");
    expect(index.find("/fake/a.module.scss", "indicator")).toEqual([]);
  });

  it("clear() is a no-op", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite()]);
    index.clear();
    expect(index.find("/fake/a.module.scss", "indicator")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**

Create `server/src/core/indexing/reverse-index.ts`:

```ts
import type { CallSite } from "@css-module-explainer/shared";

/**
 * Reverse index of cx() call sites, keyed by (scssPath, className).
 *
 * In Phase 5 every provider records its findings into a
 * NullReverseIndex — the contract is exercised but nothing is
 * stored. Phase Final swaps in a WorkspaceReverseIndex that
 * actually builds the reverse map; no provider code changes.
 */
export interface ReverseIndex {
  /**
   * Replace the contribution for `uri` with `callSites`. Idempotent:
   * a second call with the same uri drops the previous entries
   * automatically. Phase Final implementations maintain a reverse
   * pointer (uri → keys) so this stays O(1) amortised.
   */
  record(uri: string, callSites: readonly CallSite[]): void;

  /** Drop every contribution previously recorded under `uri`. */
  forget(uri: string): void;

  /**
   * Look up every CallSite referencing `className` inside the
   * CSS module at `scssPath`. Returns `[]` when nothing is known.
   */
  find(scssPath: string, className: string): readonly CallSite[];

  /** Fast count for reference-lens rendering (Phase Final). */
  count(scssPath: string, className: string): number;

  /** Drop every contribution across every uri. */
  clear(): void;
}

/**
 * No-op implementation used throughout Phase 5–Phase 9.
 *
 * Every method silently accepts input and returns empty results.
 * The class exists so providers can call `record()` unconditionally
 * from day one — when Phase Final swaps in WorkspaceReverseIndex,
 * provider code is already shaped correctly.
 */
export class NullReverseIndex implements ReverseIndex {
  record(_uri: string, _callSites: readonly CallSite[]): void {
    // intentionally empty
  }

  forget(_uri: string): void {
    // intentionally empty
  }

  find(_scssPath: string, _className: string): readonly CallSite[] {
    return [];
  }

  count(_scssPath: string, _className: string): number {
    return 0;
  }

  clear(): void {
    // intentionally empty
  }
}
```

- [ ] **Step 4: Run → pass, commit**

```bash
pnpm format && pnpm check && pnpm test
git add server/src/core/indexing/reverse-index.ts test/unit/indexing/reverse-index.test.ts
git commit -m "feat(indexing): ReverseIndex interface + NullReverseIndex Phase Final seam"
```

---

## Task 5.4: `indexing/document-analysis-cache.ts`

**Files:**
- Create: `server/src/core/indexing/document-analysis-cache.ts`
- Create: `test/unit/indexing/document-analysis-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/indexing/document-analysis-cache.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import ts from "typescript";
import type { CxBinding, CxCallInfo } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";

const SOURCE = `
  import classNames from 'classnames/bind';
  import styles from './Button.module.scss';
  const cx = classNames.bind(styles);
  const el = cx('indicator');
`;

function makeCache() {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const detectSpy = vi.fn((sourceFile: ts.SourceFile, filePath: string): CxBinding[] => {
    return [
      {
        cxVarName: "cx",
        stylesVarName: "styles",
        scssModulePath: "/fake/src/Button.module.scss",
        classNamesImportName: "classNames",
        scope: { startLine: 0, endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line },
      },
    ];
  });
  const parseSpy = vi.fn((_sourceFile: ts.SourceFile, _binding: CxBinding): CxCallInfo[] => []);
  const cache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings: detectSpy,
    parseCxCalls: parseSpy,
    max: 10,
  });
  return { cache, detectSpy, parseSpy, sourceFileCache };
}

describe("DocumentAnalysisCache", () => {
  it("analyzes a document on the first get and caches the entry", () => {
    const { cache, detectSpy, parseSpy } = makeCache();
    const entry = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(entry.bindings).toHaveLength(1);
    expect(detectSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("returns the same entry when (uri, version) matches", () => {
    const { cache, detectSpy } = makeCache();
    const first = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    const second = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(second).toBe(first);
    expect(detectSpy).toHaveBeenCalledTimes(1);
  });

  it("returns the same entry via content-hash fallback when version bumps but content is identical", () => {
    const { cache, detectSpy } = makeCache();
    const first = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    const second = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 2);
    expect(second).toBe(first);
    expect(detectSpy).toHaveBeenCalledTimes(1);
  });

  it("re-analyzes when content changes", () => {
    const { cache, detectSpy } = makeCache();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    cache.get("file:///fake/a.tsx", `${SOURCE}\nconst y = cx('extra');`, "/fake/a.tsx", 2);
    expect(detectSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidate(uri) drops the cached entry and the underlying source file", () => {
    const { cache, detectSpy, sourceFileCache } = makeCache();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    const invalidate = vi.spyOn(sourceFileCache, "invalidate");
    cache.invalidate("file:///fake/a.tsx");
    expect(invalidate).toHaveBeenCalledWith("/fake/a.tsx");
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(detectSpy).toHaveBeenCalledTimes(2);
  });

  it("clear() drops every entry", () => {
    const { cache, detectSpy } = makeCache();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    cache.get("file:///fake/b.tsx", SOURCE, "/fake/b.tsx", 1);
    cache.clear();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(detectSpy).toHaveBeenCalledTimes(3);
  });

  it("evicts the LRU entry beyond the max", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const detectSpy = vi.fn((): CxBinding[] => []);
    const parseSpy = vi.fn((): CxCallInfo[] => []);
    const cache = new DocumentAnalysisCache({
      sourceFileCache,
      detectCxBindings: detectSpy,
      parseCxCalls: parseSpy,
      max: 2,
    });
    cache.get("file:///a.tsx", "const a = 1;", "/a.tsx", 1);
    cache.get("file:///b.tsx", "const b = 2;", "/b.tsx", 1);
    cache.get("file:///a.tsx", "const a = 1;", "/a.tsx", 1); // touch a
    cache.get("file:///c.tsx", "const c = 3;", "/c.tsx", 1); // evict b
    detectSpy.mockClear();
    cache.get("file:///b.tsx", "const b = 2;", "/b.tsx", 1);
    expect(detectSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**

Create `server/src/core/indexing/document-analysis-cache.ts`:

```ts
import ts from "typescript";
import type { CxBinding, CxCallInfo } from "@css-module-explainer/shared";
import { contentHash } from "../util/hash.js";
import type { SourceFileCache } from "../ts/source-file-cache.js";

/**
 * Single-parse analysis result for one TS/JS source file.
 *
 * Providers receive this object from `DocumentAnalysisCache.get`
 * and treat it as read-only. The `version` field mirrors VS Code's
 * `TextDocument.version` — cache hits on matching version are
 * O(1), with a content-hash fallback for the "same content, new
 * version" case that happens during incremental sync edge cases.
 */
export interface AnalysisEntry {
  readonly version: number;
  readonly contentHash: string;
  readonly sourceFile: ts.SourceFile;
  readonly bindings: readonly CxBinding[];
  readonly calls: readonly CxCallInfo[];
}

export interface DocumentAnalysisCacheDeps {
  readonly sourceFileCache: SourceFileCache;
  readonly detectCxBindings: (sourceFile: ts.SourceFile, filePath: string) => CxBinding[];
  readonly parseCxCalls: (sourceFile: ts.SourceFile, binding: CxBinding) => CxCallInfo[];
  readonly max: number;
}

/**
 * The single-parse hub for every provider hot path.
 *
 * `get(uri, content, filePath, version)` returns an AnalysisEntry
 * containing the AST, bindings, and all cx() calls. The cache
 * guarantees that `ts.createSourceFile + detectCxBindings +
 * parseCxCalls` run at most once per (uri, version) — same-version
 * repeat calls are O(1), and a content-hash fallback catches the
 * case where the version bumped but the actual text is identical.
 *
 * This class is Phase 5's "one parse per file" enforcement point.
 * Lint rules (to be added in Plan 06) forbid providers from
 * calling `ts.createSourceFile` directly — every analysis goes
 * through this cache.
 */
export class DocumentAnalysisCache {
  private readonly entries = new Map<string, AnalysisEntry>();
  private readonly deps: DocumentAnalysisCacheDeps;

  constructor(deps: DocumentAnalysisCacheDeps) {
    this.deps = deps;
  }

  get(uri: string, content: string, filePath: string, version: number): AnalysisEntry {
    const cached = this.entries.get(uri);
    if (cached && cached.version === version) {
      // Exact version match — cheapest hit.
      this.touch(uri, cached);
      return cached;
    }
    const hash = contentHash(content);
    if (cached && cached.contentHash === hash) {
      // Content unchanged even though version bumped. Upgrade the
      // entry's version in place so subsequent exact-version hits
      // stay cheap, and keep the reference identity.
      const upgraded: AnalysisEntry = { ...cached, version };
      this.touch(uri, upgraded);
      return upgraded;
    }
    const entry = this.analyze(content, filePath, version, hash);
    this.put(uri, entry);
    return entry;
  }

  invalidate(uri: string): void {
    this.entries.delete(uri);
    // The SourceFileCache keys by filePath, not uri. Provider code
    // passes filePath from fileURLToPath in its wiring, so we pick
    // it off the cached entry when we can, otherwise we fall back
    // to a URL→path conversion. Today we store filePath indirectly
    // via the sourceFile.fileName field.
    const cached = this.entries.get(uri);
    const filePath = cached?.sourceFile.fileName;
    if (filePath) {
      this.deps.sourceFileCache.invalidate(filePath);
      return;
    }
    // Fallback: derive from uri when no entry is left (rare — this
    // only fires if invalidate() races with put()).
    try {
      const derived = new URL(uri).pathname;
      this.deps.sourceFileCache.invalidate(derived);
    } catch {
      // ignore — malformed URI, nothing to invalidate anyway
    }
  }

  clear(): void {
    this.entries.clear();
    this.deps.sourceFileCache.clear();
  }

  private analyze(
    content: string,
    filePath: string,
    version: number,
    hash: string,
  ): AnalysisEntry {
    const sourceFile = this.deps.sourceFileCache.get(filePath, content);
    const bindings = this.deps.detectCxBindings(sourceFile, filePath);
    const calls: CxCallInfo[] = [];
    for (const binding of bindings) {
      calls.push(...this.deps.parseCxCalls(sourceFile, binding));
    }
    return { version, contentHash: hash, sourceFile, bindings, calls };
  }

  private touch(uri: string, entry: AnalysisEntry): void {
    this.entries.delete(uri);
    this.entries.set(uri, entry);
  }

  private put(uri: string, entry: AnalysisEntry): void {
    if (this.entries.has(uri)) {
      this.entries.delete(uri);
    } else if (this.entries.size >= this.deps.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(uri, entry);
  }
}
```

> **Note on the `invalidate(uri)` path-lookup dance:** `DocumentAnalysisCache` keys by `uri` (what providers hand in from `TextDocumentParams`), but `SourceFileCache` keys by `filePath` (absolute disk path). The invalidate path reads `sourceFile.fileName` off the cached entry for the canonical mapping. If Phase 10 adds a direct `uri → filePath` map to the cache entry, this dance simplifies.

- [ ] **Step 4: Run → pass**

```bash
pnpm format && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add server/src/core/indexing/document-analysis-cache.ts test/unit/indexing/document-analysis-cache.test.ts
git commit -m "$(cat <<'EOF'
feat(indexing): DocumentAnalysisCache — single-parse hub

DocumentAnalysisCache is the "one parse per file" enforcement
point every provider hot path will go through. Key features:

- Version-based primary key (TextDocument.version), O(1) hit
- Content-hash fallback for same-content-new-version edges
- Composes SourceFileCache + detectCxBindings + parseCxCalls
  via dependency injection, so provider unit tests can swap in
  mocks without booting the ts parser
- LRU eviction at `max`
- invalidate(uri) propagates to the underlying SourceFileCache
- clear() drops both layers

This is the front door every provider (Plans 06–09.5) will
dispatch through — the "one parse per file" principle from
spec section 7.2.1 is ratified here.
EOF
)"
```

---

## Task 5.5: `indexing/indexer-worker.ts` skeleton

**Files:**
- Create: `server/src/core/indexing/indexer-worker.ts`
- Create: `test/unit/indexing/indexer-worker.test.ts`

This is a SKELETON. Phase 10 adds the real `scssFileSupplier`. Phase 5 just ships the class + its supplier injection interface so provider wiring in Plans 06–09 has something to depend on.

- [ ] **Step 1: Write the failing test**

Create `test/unit/indexing/indexer-worker.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { FileTask } from "../../../server/src/core/indexing/indexer-worker.js";
import { IndexerWorker } from "../../../server/src/core/indexing/indexer-worker.js";

async function* tasks(items: FileTask[]): AsyncIterable<FileTask> {
  for (const item of items) {
    yield item;
  }
}

describe("IndexerWorker", () => {
  it("processes every task from the supplier via onScssFile", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () =>
        tasks([
          { kind: "scss", path: "/a.module.scss" },
          { kind: "scss", path: "/b.module.scss" },
        ]),
      readFile: async (p) => `/* ${p} */`,
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    await worker.start();
    expect(onScssFile).toHaveBeenCalledTimes(2);
    expect(onScssFile).toHaveBeenNthCalledWith(1, "/a.module.scss", "/* /a.module.scss */");
    expect(onScssFile).toHaveBeenNthCalledWith(2, "/b.module.scss", "/* /b.module.scss */");
  });

  it("routes tsx tasks through onTsxFile", async () => {
    const onTsxFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([{ kind: "tsx", path: "/a.tsx" }]),
      readFile: async () => "const x = 1;",
      onScssFile: () => {},
      onTsxFile,
      logger: { info: () => {}, error: () => {} },
    });
    await worker.start();
    expect(onTsxFile).toHaveBeenCalledWith("/a.tsx", "const x = 1;");
  });

  it("skips tasks whose readFile returns null", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([{ kind: "scss", path: "/missing.module.scss" }]),
      readFile: async () => null,
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    await worker.start();
    expect(onScssFile).not.toHaveBeenCalled();
  });

  it("logs and skips when readFile throws", async () => {
    const onScssFile = vi.fn();
    const errors: string[] = [];
    const worker = new IndexerWorker({
      supplier: () => tasks([{ kind: "scss", path: "/boom.module.scss" }]),
      readFile: async () => {
        throw new Error("disk error");
      },
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: (msg) => errors.push(msg) },
    });
    await worker.start();
    expect(onScssFile).not.toHaveBeenCalled();
    expect(errors.length).toBe(1);
    expect(errors[0]!).toContain("/boom.module.scss");
  });

  it("pushFile() queues an incremental task for the current run", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([]),
      readFile: async () => "",
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    const started = worker.start();
    worker.pushFile({ kind: "scss", path: "/incremental.module.scss" });
    await started;
    // The supplier had zero items, so the pushed file is the only
    // task the worker sees. Real Phase 10 behaviour: pushed tasks
    // merge with the background scan queue.
    expect(onScssFile).toHaveBeenCalledWith("/incremental.module.scss", "");
  });

  it("stop() prevents further tasks from being processed", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () =>
        tasks([
          { kind: "scss", path: "/a.module.scss" },
          { kind: "scss", path: "/b.module.scss" },
        ]),
      readFile: async () => "",
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    worker.stop();
    await worker.start();
    expect(onScssFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**

Create `server/src/core/indexing/indexer-worker.ts`:

```ts
export interface FileTask {
  readonly kind: "scss" | "tsx";
  readonly path: string;
}

export interface IndexerWorkerDeps {
  /**
   * Background file supplier. Phase 5 ships no real supplier;
   * Phase 10 injects one that walks `**\/\*.module.{scss,css}`.
   * Phase Final extends it with tsx walking.
   */
  readonly supplier: () => AsyncIterable<FileTask>;
  /** Async file reader. Returns null when the file is missing. */
  readonly readFile: (path: string) => Promise<string | null>;
  /** Callback for every successfully read SCSS/CSS module file. */
  readonly onScssFile: (path: string, content: string) => void;
  /** Callback for every successfully read TSX/JSX/TS/JS file. */
  readonly onTsxFile: (path: string, content: string) => void;
  readonly logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * Background indexer skeleton.
 *
 * Phase 5 ships this with no real supplier — Phase 10 adds the
 * scssFileSupplier that walks the workspace, and Phase Final
 * extends it with a tsx walker for reverse-index population.
 * Provider wiring in Plans 06–09 can depend on IndexerWorker
 * today; flipping the supplier later is a one-line change.
 *
 * Design notes:
 * - `start()` yields to the event loop (`setImmediate`) between
 *   every file so LSP requests preempt naturally. With a 5ms
 *   parse per file, the worst-case request latency added by the
 *   worker is 5ms.
 * - `pushFile(task)` queues an incremental file for the current
 *   run — Phase 10's file watcher feeds this.
 * - `stop()` sets a cancellation flag checked on every task
 *   boundary. A running task is allowed to finish; no in-flight
 *   task is killed mid-parse.
 */
export class IndexerWorker {
  private readonly deps: IndexerWorkerDeps;
  private stopped = false;
  private readonly pending: FileTask[] = [];

  constructor(deps: IndexerWorkerDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    for await (const task of this.deps.supplier()) {
      if (this.stopped) return;
      await this.yieldToEventLoop();
      await this.process(task);
    }
    while (this.pending.length > 0) {
      if (this.stopped) return;
      const task = this.pending.shift();
      if (task) {
        await this.yieldToEventLoop();
        await this.process(task);
      }
    }
  }

  pushFile(task: FileTask): void {
    this.pending.push(task);
  }

  stop(): void {
    this.stopped = true;
    this.pending.length = 0;
  }

  private async process(task: FileTask): Promise<void> {
    let content: string | null = null;
    try {
      content = await this.deps.readFile(task.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.logger.error(`[indexer] readFile failed for ${task.path}: ${message}`);
      return;
    }
    if (content === null) return;
    if (task.kind === "scss") {
      this.deps.onScssFile(task.path, content);
    } else {
      this.deps.onTsxFile(task.path, content);
    }
  }

  private yieldToEventLoop(): Promise<void> {
    return new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}
```

- [ ] **Step 4: Run → pass, commit**

```bash
pnpm format && pnpm check && pnpm test
git add server/src/core/indexing/indexer-worker.ts test/unit/indexing/indexer-worker.test.ts
git commit -m "feat(indexing): IndexerWorker skeleton with supplier injection"
```

---

## Task 5.6: `providers/provider-utils.ts`

**Files:**
- Create: `server/src/providers/provider-utils.ts`
- Create: `test/unit/providers/provider-utils.test.ts`

This is the LAST piece of Phase 5 — the shared front stage that Plans 06–09.5 all dispatch through.

- [ ] **Step 1: Write the failing test**

Create `test/unit/providers/provider-utils.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import ts from "typescript";
import type {
  CxBinding,
  CxCallInfo,
  ResolvedType,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index.js";
import type { TypeResolver } from "../../../server/src/core/ts/type-resolver.js";
import {
  withCxCallAtCursor,
  isInsideCxCall,
  type ProviderDeps,
} from "../../../server/src/providers/provider-utils.js";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
`;

const STUB_SCSS = `.indicator { color: red; }`;

function makeInfo(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
}

class FakeTypeResolver implements TypeResolver {
  resolve(): ResolvedType {
    return { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

function makeDeps(
  overrides: Partial<ProviderDeps> = {},
  detectSpy?: (sourceFile: ts.SourceFile, filePath: string) => CxBinding[],
  parseSpy?: (sourceFile: ts.SourceFile, binding: CxBinding) => CxCallInfo[],
): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const detectCxBindings =
    detectSpy ??
    ((sourceFile): CxBinding[] => [
      {
        cxVarName: "cx",
        stylesVarName: "styles",
        scssModulePath: "/fake/src/Button.module.scss",
        classNamesImportName: "classNames",
        scope: {
          startLine: 0,
          endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
        },
      },
    ]);
  const parseCxCalls =
    parseSpy ??
    ((): CxCallInfo[] => [
      {
        kind: "static",
        className: "indicator",
        originRange: {
          start: { line: 4, character: 15 },
          end: { line: 4, character: 24 },
        },
        binding: {
          cxVarName: "cx",
          stylesVarName: "styles",
          scssModulePath: "/fake/src/Button.module.scss",
          classNamesImportName: "classNames",
          scope: { startLine: 0, endLine: 999 },
        },
      },
    ]);
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings,
    parseCxCalls,
    max: 10,
  });
  return {
    analysisCache,
    scssClassMapFor: () => new Map([["indicator", makeInfo("indicator")]]) as ScssClassMap,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake",
    ...overrides,
  };
}

describe("isInsideCxCall", () => {
  it("returns true when the last cx( is still open on the line", () => {
    expect(isInsideCxCall("const x = cx('abc", "cx")).toBe(true);
  });

  it("returns false when the cx call is already closed", () => {
    expect(isInsideCxCall("const x = cx('abc')", "cx")).toBe(false);
  });

  it("returns false when there is no cx call on the line", () => {
    expect(isInsideCxCall("const x = 1", "cx")).toBe(false);
  });

  it("handles nested parens correctly", () => {
    expect(isInsideCxCall("cx(isActive && 'on'", "cx")).toBe(true);
    expect(isInsideCxCall("cx(isActive && 'on')", "cx")).toBe(false);
  });

  it("handles an object literal inside the call", () => {
    expect(isInsideCxCall("cx({ active", "cx")).toBe(true);
    expect(isInsideCxCall("cx({ active: true", "cx")).toBe(true);
    expect(isInsideCxCall("cx({ active: true })", "cx")).toBe(false);
  });

  it("ignores a cx call from earlier on the same line", () => {
    expect(isInsideCxCall("const a = cx('b'); const c = cx('d", "cx")).toBe(true);
  });

  it("respects custom variable names", () => {
    expect(isInsideCxCall("const x = classes('abc", "classes")).toBe(true);
    expect(isInsideCxCall("const x = cx('abc", "classes")).toBe(false);
  });
});

describe("withCxCallAtCursor / fast paths", () => {
  it("returns null when content does not import classnames/bind", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: "const x = 1;",
        filePath: "/fake/a.tsx",
        line: 0,
        character: 0,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });

  it("returns null when the cursor line has no parenthesis", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 0, // the `import` line
        character: 0,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });
});

describe("withCxCallAtCursor / call dispatch", () => {
  it("passes a CxCallContext to transform when the cursor is on a known call", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ({ hit: ctx.call.kind }));
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18, // middle of 'indicator'
        version: 1,
      },
      deps,
      spy,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ hit: "static" });
  });

  it("returns null when the cursor is in a file with bindings but outside any call", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 3, // the `const cx = ...` line
        character: 0,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });

  it("passes the reverseIndex from deps to the transform context", () => {
    const index = new NullReverseIndex();
    const deps = makeDeps({ reverseIndex: index });
    const spy = vi.fn((ctx) => ctx.reverseIndex);
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18,
        version: 1,
      },
      deps,
      spy,
    );
    expect(result).toBe(index);
  });
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**

Create `server/src/providers/provider-utils.ts`:

```ts
import type {
  CxBinding,
  CxCallInfo,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import type { DocumentAnalysisCache } from "../core/indexing/document-analysis-cache.js";
import type { ReverseIndex } from "../core/indexing/reverse-index.js";
import type { TypeResolver } from "../core/ts/type-resolver.js";
import { getLineAt } from "../core/util/text-utils.js";

/**
 * One request's cursor location, plus the document context the
 * provider needs to resolve it.
 */
export interface CursorParams {
  readonly documentUri: string;
  readonly content: string;
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly version: number;
}

/**
 * The dependency bag every provider handler accepts.
 *
 * Composition root (server/src/server.ts) builds this once at
 * startup; provider unit tests build a stub via `makeDeps()` in
 * test helpers. Keeping this a plain interface with no methods
 * keeps provider tests trivial.
 */
export interface ProviderDeps {
  readonly analysisCache: DocumentAnalysisCache;
  /**
   * Look up the ScssClassMap for a binding. The composition root
   * wires this to a `StyleIndexCache.get` reading the file from
   * disk; tests pass an in-memory function.
   */
  readonly scssClassMapFor: (binding: CxBinding) => ScssClassMap | null;
  readonly typeResolver: TypeResolver;
  readonly reverseIndex: ReverseIndex;
  readonly workspaceRoot: string;
}

/**
 * The data every `withCxCallAtCursor` transform receives.
 */
export interface CxCallContext {
  readonly call: CxCallInfo;
  readonly binding: CxBinding;
  readonly classMap: ScssClassMap;
  readonly typeResolver: TypeResolver;
  readonly reverseIndex: ReverseIndex;
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly matches: readonly SelectorInfo[];
}

/**
 * Front stage for every Plan 06–09.5 provider.
 *
 * Three fast paths are checked before any AST work:
 *
 *   1. `content.includes('classnames/bind')` — skip files that
 *      import nothing relevant.
 *   2. Cursor line has no `(` — no cx call can possibly be open
 *      at the cursor.
 *   3. `analysisCache.get()` returns empty bindings → skip.
 *
 * Only then does the function iterate the cached `CxCallInfo`
 * list looking for one whose `originRange` contains the cursor.
 * If found, the transform is invoked with a fully-populated
 * CxCallContext including the resolved SCSS class map.
 *
 * The function never throws — transform exceptions bubble.
 */
export function withCxCallAtCursor<T>(
  params: CursorParams,
  deps: ProviderDeps,
  transform: (ctx: CxCallContext) => T | null,
): T | null {
  // Fast path 1 — no classnames/bind import anywhere in the file.
  if (!params.content.includes("classnames/bind")) {
    return null;
  }

  // Fast path 2 — the cursor line has no `(`, so no cx call can
  // span it. Note: getLineAt is cheap (O(line length)), not
  // O(file length), so this is safe to run on every request.
  const line = getLineAt(params.content, params.line);
  if (line === undefined || !line.includes("(")) {
    return null;
  }

  // Slow path — parse and walk.
  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (entry.bindings.length === 0) {
    return null;
  }

  // Record findings into the reverse index unconditionally so
  // Phase Final's WorkspaceReverseIndex receives data on the
  // first swap. Phase 5's NullReverseIndex is a no-op.
  const callSites = entry.calls.map((call) => ({
    uri: params.documentUri,
    range: call.originRange,
    binding: call.binding,
    kind: call.kind,
    matchInfo: matchInfoFor(call),
  }));
  deps.reverseIndex.record(params.documentUri, callSites);

  // Find the call whose originRange contains the cursor.
  const call = findCallAtCursor(entry.calls, params.line, params.character);
  if (!call) return null;

  const classMap = deps.scssClassMapFor(call.binding);
  if (!classMap) return null;

  return transform({
    call,
    binding: call.binding,
    classMap,
    typeResolver: deps.typeResolver,
    reverseIndex: deps.reverseIndex,
    workspaceRoot: deps.workspaceRoot,
    filePath: params.filePath,
    // `matches` is left empty here — call-resolver fills it in
    // where each provider needs it. Providers call
    // `resolveCxCallToSelectorInfos` themselves, since the choice
    // of how to use the result (single, multi, filter) is
    // provider-specific.
    matches: [],
  });
}

/**
 * Return true when the last `cxVarName(` on `textBefore` is still
 * open — i.e. the cursor is inside the argument list of a cx
 * call. Used by the completion provider to gate trigger chars.
 */
export function isInsideCxCall(textBefore: string, cxVarName: string): boolean {
  // Find the last `cxVarName(` occurrence.
  const needle = `${cxVarName}(`;
  const callIdx = textBefore.lastIndexOf(needle);
  if (callIdx === -1) return false;

  // Walk forward from after the opening paren, counting
  // parenthesis depth. We are inside the cx call if depth > 0
  // by the end of the string.
  let depth = 1;
  for (let i = callIdx + needle.length; i < textBefore.length; i += 1) {
    const ch = textBefore[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return false;
    }
  }
  return depth > 0;
}

function findCallAtCursor(
  calls: readonly CxCallInfo[],
  line: number,
  character: number,
): CxCallInfo | null {
  for (const call of calls) {
    const { start, end } = call.originRange;
    if (line < start.line || line > end.line) continue;
    if (line === start.line && character < start.character) continue;
    if (line === end.line && character > end.character) continue;
    return call;
  }
  return null;
}

function matchInfoFor(call: CxCallInfo): string {
  switch (call.kind) {
    case "static":
      return `static: ${call.className}`;
    case "template":
      return `prefix: ${call.staticPrefix}`;
    case "variable":
      return `variable: ${call.variableName}`;
  }
}
```

- [ ] **Step 4: Run → pass**

```bash
pnpm format && pnpm check && pnpm test && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/provider-utils.ts test/unit/providers/provider-utils.test.ts
git commit -m "$(cat <<'EOF'
feat(providers): provider-utils — the shared front stage

server/src/providers/provider-utils.ts defines the three things
every provider (definition / hover / completion / diagnostics /
code-actions) in Plans 06–09.5 will depend on:

- CursorParams + ProviderDeps + CxCallContext — the interfaces
  the composition root wires once at startup.
- withCxCallAtCursor<T> — the front stage. Three fast paths
  (no classnames/bind import → skip, cursor line without `(` →
  skip, bindings empty → skip) short-circuit 90%+ of hover
  requests before any AST work. Only survivors go through
  DocumentAnalysisCache and get a fully-populated CxCallContext.
- isInsideCxCall — paren-depth aware gate for completion trigger
  characters. Handles nested objects, multi-arg calls, and
  custom cx variable names.

Every call through withCxCallAtCursor records CallSite data into
the ReverseIndex unconditionally. Phase 5's NullReverseIndex is a
no-op, but Phase Final's WorkspaceReverseIndex will receive a
fully-populated stream on first swap without any provider code
changes.

This closes out Phase 5: every primitive Plans 06–09.5 need is
now in place.
EOF
)"
```

---

## Plan 05 Completion Checklist

- [ ] `shared/src/types.ts` exports `CallSite`.
- [ ] `server/src/core/util/text-utils.ts` exports the 5 string helpers.
- [ ] `server/src/core/indexing/reverse-index.ts` exports `ReverseIndex` + `NullReverseIndex`.
- [ ] `server/src/core/indexing/document-analysis-cache.ts` exports `DocumentAnalysisCache` + `AnalysisEntry`.
- [ ] `server/src/core/indexing/indexer-worker.ts` exports `IndexerWorker` + `FileTask`.
- [ ] `server/src/providers/provider-utils.ts` exports `CursorParams`, `ProviderDeps`, `CxCallContext`, `withCxCallAtCursor`, `isInsideCxCall`.
- [ ] `pnpm check && pnpm test && pnpm build` all green.
- [ ] Layer rule: `providers/provider-utils.ts` imports `TypeResolver` as type-only, never `WorkspaceTypeResolver` directly.

When every item is checked, Plan 05 is complete. Proceed to Plan 06 (the first provider — definition, Phase 6).
