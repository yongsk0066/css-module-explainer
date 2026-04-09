# Plan 04 — TypeScript 2-Tier + Call Resolver (Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the TypeScript resolver layer that turns `CxCallInfo` into concrete `SelectorInfo[]`. This closes the loop between Phase 1 (SCSS indexing) and Phase 3 (cx call parsing), producing the final data providers (Plans 06+) will serve to VS Code.

**Architecture:** Three modules land. `ts/source-file-cache.ts` is the **in-flight tier** — an LRU of `ts.SourceFile` parsed from editor-live text, used by provider hot paths that must not wait for disk I/O. `ts/type-resolver.ts` is the **workspace tier** — a `TypeResolver` interface plus a `WorkspaceTypeResolver` that lazily creates a single `ts.Program` rooted at the user's `tsconfig.json` and uses its `TypeChecker` to resolve `cx(unionVar)` union-of-string-literal types. `cx/call-resolver.ts` is the thin glue function `resolveCxCallToSelectorInfos` that dispatches by `CxCallInfo.kind`: static → `classMap.get`, template → `classMap.values().filter(startsWith)`, variable → `typeResolver.resolve(...)` → `classMap.get` per literal.

The `ResolvedType` shape lives in `shared/src/types.ts` so providers can consume it without reaching into `ts/`.

**Tech Stack:** typescript@^6.0.2 · vitest@^4.1.3 · @css-module-explainer/shared

---

## Spec References

- Spec section 3.6 — `cx/call-resolver.ts`
- Spec section 3.7 — `ts/source-file-cache.ts` + `ts/type-resolver.ts`
- Q3 B+D — template literal prefix matching and union variable resolution
- Design section 2.5 — 2-tier TypeScript strategy (in-flight vs workspace)

## End State

- `shared/src/types.ts` exposes `ResolvedType` (discriminated union: `union` / `unresolvable`).
- `server/src/core/ts/source-file-cache.ts` exports `SourceFileCache` with `{ max }` LRU.
- `server/src/core/ts/type-resolver.ts` exports `TypeResolver` interface + `WorkspaceTypeResolver` class.
- `server/src/core/cx/call-resolver.ts` exports `resolveCxCallToSelectorInfos(...)`.
- `test/unit/ts/source-file-cache.test.ts` + `test/unit/ts/type-resolver.test.ts` + `test/unit/cx/call-resolver.test.ts` all passing.
- Layer rule: `cx/call-resolver.ts` may import from `shared` + the `TypeResolver` interface only. It must NOT import `WorkspaceTypeResolver` directly.
- `pnpm check && pnpm test && pnpm build` all green.

---

## File Structure

```
shared/src/
  types.ts                          # Extend with ResolvedType
server/src/core/ts/
  source-file-cache.ts              # LRU of ts.SourceFile
  type-resolver.ts                  # TypeResolver interface + WorkspaceTypeResolver
server/src/core/cx/
  call-resolver.ts                  # resolveCxCallToSelectorInfos
test/unit/ts/
  source-file-cache.test.ts
  type-resolver.test.ts             # In-memory ts.Program via virtual CompilerHost
test/unit/cx/
  call-resolver.test.ts             # Uses FakeTypeResolver, not WorkspaceTypeResolver
```

---

## Working Directory

All commands from `/Users/yongseok/dev/css-module-explainer/`.

---

## Task 4.1: Add `ResolvedType` to shared

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Append to `types.ts`**

Below the Cx types section:

```ts
// ──────────────────────────────────────────────────────────────
// Type resolution (Phase 4)
// ──────────────────────────────────────────────────────────────

/**
 * Result of resolving a TypeScript identifier to its string-literal
 * union type.
 *
 * - `kind: "union"` carries every literal member the checker saw.
 *   A single-member union (single string literal) is represented
 *   the same way, so consumers do not branch on arity.
 * - `kind: "unresolvable"` is returned when the identifier cannot
 *   be matched to a string-literal union — either because the
 *   symbol is missing, the type is not a literal union, or the
 *   program could not be built. The empty `values` array keeps
 *   the consumer code branch-free.
 */
export type ResolvedType =
  | { readonly kind: "union"; readonly values: readonly string[] }
  | { readonly kind: "unresolvable"; readonly values: readonly [] };
```

- [ ] **Step 2: Re-export from `shared/src/index.ts`**

```ts
export type {
  Position,
  Range,
  StyleLang,
  SelectorInfo,
  ScssClassMap,
  CxBinding,
  CxCallInfo,
  StaticClassCall,
  TemplateLiteralCall,
  VariableRefCall,
  ResolvedType,
} from "./types.js";
```

- [ ] **Step 3: Commit**

```bash
pnpm typecheck
git add shared/src/
git commit -m "feat(shared): add ResolvedType discriminated union for Phase 4 resolver"
```

---

## Task 4.2: `ts/source-file-cache.ts` — in-flight LRU

**Files:**
- Create: `server/src/core/ts/source-file-cache.ts`
- Create: `test/unit/ts/source-file-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/ts/source-file-cache.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";

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
    // A successful parse emits no parse diagnostic at this shape.
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
    // After clear, subsequent gets re-parse even if content matches.
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
    // Walk into the first statement; its parent must be the SourceFile.
    const firstStatement = sf.statements[0]!;
    expect(firstStatement.parent).toBe(sf);
  });
});
```

- [ ] **Step 2: Run → fail**

```bash
pnpm test
```

Expected: `Cannot find module '.../source-file-cache.js'`.

- [ ] **Step 3: Implement**

Create `server/src/core/ts/source-file-cache.ts`:

```ts
import * as crypto from "node:crypto";
import ts from "typescript";

interface SourceFileCacheEntry {
  hash: string;
  sourceFile: ts.SourceFile;
}

/**
 * In-flight tier of the 2-tier TypeScript strategy.
 *
 * The provider hot path needs to re-read a live editor buffer on
 * every keystroke without waiting for disk I/O. SourceFileCache
 * parses `ts.createSourceFile` once per (path, contentHash) and
 * returns the cached node on subsequent calls with the same text.
 *
 * parentNodes is always set, so consumers can walk up the tree to
 * find an enclosing function or statement (cx/binding-detector
 * relies on this).
 */
export class SourceFileCache {
  private readonly entries = new Map<string, SourceFileCacheEntry>();
  private readonly max: number;

  constructor(options: { max: number }) {
    this.max = options.max;
  }

  get(filePath: string, content: string): ts.SourceFile {
    const hash = contentHash(content);
    const cached = this.entries.get(filePath);
    if (cached && cached.hash === hash) {
      // Touch: move to the end so frequently-used files stay warm.
      this.entries.delete(filePath);
      this.entries.set(filePath, cached);
      return cached.sourceFile;
    }
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      scriptKindFor(filePath),
    );
    this.put(filePath, { hash, sourceFile });
    return sourceFile;
  }

  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  clear(): void {
    this.entries.clear();
  }

  private put(filePath: string, entry: SourceFileCacheEntry): void {
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

/**
 * Pick the ts.ScriptKind from a file extension. Unknown extensions
 * fall back to TSX (the most permissive parser).
 */
function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TSX;
}

function contentHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}
```

- [ ] **Step 4: Run → pass, then commit**

```bash
pnpm format && pnpm check && pnpm test
git add server/src/core/ts/source-file-cache.ts test/unit/ts/source-file-cache.test.ts
git commit -m "feat(ts): add SourceFileCache — in-flight LRU for live editor buffers"
```

---

## Task 4.3: `ts/type-resolver.ts` — workspace tier

**Files:**
- Create: `server/src/core/ts/type-resolver.ts`
- Create: `test/unit/ts/type-resolver.test.ts`

The `WorkspaceTypeResolver` needs a real `ts.Program` to query the checker. For tests, we use a virtual `CompilerHost` that serves source text from a `Map<string, string>` — no filesystem, fast, deterministic.

- [ ] **Step 1: Write the failing test**

Create `test/unit/ts/type-resolver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import ts from "typescript";
import {
  WorkspaceTypeResolver,
  type TypeResolver,
} from "../../../server/src/core/ts/type-resolver.js";

/**
 * Build a fake workspace with an in-memory compiler host.
 *
 * The resolver under test treats `workspaceRoot` as an opaque key;
 * we hand it a synthetic root and inject a pre-built program via
 * the `createProgram` option so the resolver never touches disk.
 */
function makeFakeResolver(
  files: Record<string, string>,
  rootNames: string[] = Object.keys(files),
): TypeResolver {
  const host: ts.CompilerHost = {
    fileExists: (p) => p in files,
    readFile: (p) => files[p],
    getSourceFile: (fileName, languageVersion) => {
      const text = files[fileName];
      if (text === undefined) return undefined;
      return ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TSX);
    },
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/ws",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    directoryExists: () => true,
    getDirectories: () => [],
  };
  return new WorkspaceTypeResolver({
    createProgram: () =>
      ts.createProgram({
        rootNames,
        options: {
          target: ts.ScriptTarget.Latest,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          strict: true,
          noLib: true,
          skipLibCheck: true,
        },
        host,
      }),
  });
}

describe("WorkspaceTypeResolver.resolve", () => {
  it("resolves a const-declared string literal to a single-member union", () => {
    const resolver = makeFakeResolver({
      "/ws/a.tsx": `const size = "small" as const; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["small"]);
  });

  it("resolves a parameter typed as a string-literal union", () => {
    const resolver = makeFakeResolver({
      "/ws/a.tsx": `
        type Size = "small" | "medium" | "large";
        function Button({ size }: { size: Size }) { return size; }
        export {};
      `,
    });
    const result = resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["large", "medium", "small"]);
  });

  it("resolves a destructured prop typed via an alias", () => {
    const resolver = makeFakeResolver({
      "/ws/a.tsx": `
        interface Props { variant: "primary" | "secondary" }
        function Button({ variant }: Props) { return variant; }
        export {};
      `,
    });
    const result = resolver.resolve("/ws/a.tsx", "variant", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["primary", "secondary"]);
  });

  it("returns unresolvable when the identifier cannot be found", () => {
    const resolver = makeFakeResolver({
      "/ws/a.tsx": `const a = 1; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "nowhere", "/ws");
    expect(result.kind).toBe("unresolvable");
    expect(result.values).toEqual([]);
  });

  it("returns unresolvable for a non-string type (number)", () => {
    const resolver = makeFakeResolver({
      "/ws/a.tsx": `const count: number = 5; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "count", "/ws");
    expect(result.kind).toBe("unresolvable");
  });

  it("returns unresolvable for `string` without literal narrowing", () => {
    const resolver = makeFakeResolver({
      "/ws/a.tsx": `const name: string = "x"; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "name", "/ws");
    expect(result.kind).toBe("unresolvable");
  });

  it("caches the ts.Program per workspaceRoot (warmUp observable)", () => {
    let calls = 0;
    const host: ts.CompilerHost = {
      fileExists: (p) => p === "/ws/a.tsx",
      readFile: () => `const size = "s" as const; export {};`,
      getSourceFile: (fileName, languageVersion) =>
        ts.createSourceFile(
          fileName,
          `const size = "s" as const; export {};`,
          languageVersion,
          true,
          ts.ScriptKind.TSX,
        ),
      getDefaultLibFileName: () => "lib.d.ts",
      writeFile: () => {},
      getCurrentDirectory: () => "/ws",
      getCanonicalFileName: (f) => f,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      directoryExists: () => true,
      getDirectories: () => [],
    };
    const resolver = new WorkspaceTypeResolver({
      createProgram: () => {
        calls += 1;
        return ts.createProgram({
          rootNames: ["/ws/a.tsx"],
          options: { noLib: true, skipLibCheck: true },
          host,
        });
      },
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(1);
  });

  it("invalidate(workspaceRoot) forces the next resolve to rebuild", () => {
    let calls = 0;
    const host: ts.CompilerHost = {
      fileExists: () => true,
      readFile: () => `const size = "s" as const; export {};`,
      getSourceFile: (fileName, languageVersion) =>
        ts.createSourceFile(
          fileName,
          `const size = "s" as const; export {};`,
          languageVersion,
          true,
          ts.ScriptKind.TSX,
        ),
      getDefaultLibFileName: () => "lib.d.ts",
      writeFile: () => {},
      getCurrentDirectory: () => "/ws",
      getCanonicalFileName: (f) => f,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      directoryExists: () => true,
      getDirectories: () => [],
    };
    const resolver = new WorkspaceTypeResolver({
      createProgram: () => {
        calls += 1;
        return ts.createProgram({
          rootNames: ["/ws/a.tsx"],
          options: { noLib: true, skipLibCheck: true },
          host,
        });
      },
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.invalidate("/ws");
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run → fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement `type-resolver.ts`**

Create `server/src/core/ts/type-resolver.ts`:

```ts
import ts from "typescript";
import type { ResolvedType } from "@css-module-explainer/shared";

/**
 * Workspace tier of the 2-tier TypeScript strategy.
 *
 * TypeResolver resolves a bare identifier like `cx(size)` to its
 * string-literal union members by walking the TypeChecker. A
 * single cached `ts.Program` per workspace amortises the expensive
 * setup; Phase 4 callers either use the real WorkspaceTypeResolver
 * or inject a FakeTypeResolver in unit tests.
 */
export interface TypeResolver {
  /**
   * Given a file path, an identifier name visible at that file,
   * and the owning workspace root, return the identifier's
   * string-literal union type.
   *
   * The method must always return a ResolvedType — `unresolvable`
   * is a valid "the checker could not narrow this" result.
   */
  resolve(filePath: string, variableName: string, workspaceRoot: string): ResolvedType;

  /** Drop the cached program for one workspace (e.g. on tsconfig change). */
  invalidate(workspaceRoot: string): void;

  /** Drop every cached program. */
  clear(): void;
}

export interface WorkspaceTypeResolverDeps {
  /**
   * Build a fresh ts.Program rooted at the given workspace. The
   * production composition root passes a function that reads
   * tsconfig.json from disk; tests pass a virtual CompilerHost
   * so no filesystem is touched.
   */
  createProgram: (workspaceRoot: string) => ts.Program;
}

/**
 * Default implementation of TypeResolver. Lazily builds one
 * ts.Program per workspaceRoot on first resolve, caches it, and
 * reuses the same TypeChecker across subsequent queries.
 */
export class WorkspaceTypeResolver implements TypeResolver {
  private readonly programs = new Map<string, ts.Program>();
  private readonly deps: WorkspaceTypeResolverDeps;

  constructor(deps: WorkspaceTypeResolverDeps) {
    this.deps = deps;
  }

  resolve(filePath: string, variableName: string, workspaceRoot: string): ResolvedType {
    const program = this.getOrCreateProgram(workspaceRoot);
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return UNRESOLVABLE;
    }
    const checker = program.getTypeChecker();
    const symbol = findIdentifierSymbol(sourceFile, variableName, checker);
    if (!symbol) {
      return UNRESOLVABLE;
    }
    const type = checker.getTypeOfSymbolAtLocation(symbol, sourceFile);
    return extractStringLiterals(type, checker);
  }

  invalidate(workspaceRoot: string): void {
    this.programs.delete(workspaceRoot);
  }

  clear(): void {
    this.programs.clear();
  }

  private getOrCreateProgram(workspaceRoot: string): ts.Program {
    const cached = this.programs.get(workspaceRoot);
    if (cached) return cached;
    const program = this.deps.createProgram(workspaceRoot);
    this.programs.set(workspaceRoot, program);
    return program;
  }
}

const UNRESOLVABLE: ResolvedType = { kind: "unresolvable", values: [] };

/**
 * Walk the source file for an identifier matching `variableName`
 * and return its checker symbol. Looks at variable declarations,
 * function parameters, and destructuring binding elements — all
 * three places a `cx(x)` argument typically comes from.
 */
function findIdentifierSymbol(
  sourceFile: ts.SourceFile,
  variableName: string,
  checker: ts.TypeChecker,
): ts.Symbol | null {
  let found: ts.Symbol | null = null;

  function visit(node: ts.Node): void {
    if (found) return;

    const nameNode =
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node)
        ? node.name
        : null;

    if (nameNode && ts.isIdentifier(nameNode) && nameNode.text === variableName) {
      const symbol = checker.getSymbolAtLocation(nameNode);
      if (symbol) {
        found = symbol;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

/**
 * Narrow a ts.Type to a string-literal union.
 *
 * - Single string literal (`"small"`) → single-member union.
 * - Union of string literals (`"small" | "medium"`) → full list.
 * - Union with any non-string-literal member → unresolvable (we
 *   refuse to guess).
 * - Anything else → unresolvable.
 */
function extractStringLiterals(type: ts.Type, checker: ts.TypeChecker): ResolvedType {
  // Single string literal type — `const x = "a" as const`.
  if (type.isStringLiteral()) {
    return { kind: "union", values: [type.value] };
  }

  if (type.isUnion()) {
    const values: string[] = [];
    for (const member of type.types) {
      if (member.isStringLiteral()) {
        values.push(member.value);
      } else {
        // Mixed union (e.g. `"a" | number`) — refuse to narrow.
        return UNRESOLVABLE;
      }
    }
    if (values.length > 0) {
      return { kind: "union", values };
    }
  }

  // Generic → try the base constraint (e.g. `T extends "a" | "b"`).
  const base = checker.getBaseConstraintOfType(type);
  if (base && base !== type) {
    return extractStringLiterals(base, checker);
  }

  return UNRESOLVABLE;
}
```

- [ ] **Step 4: Run → pass**

```bash
pnpm format && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add server/src/core/ts/type-resolver.ts test/unit/ts/type-resolver.test.ts
git commit -m "feat(ts): WorkspaceTypeResolver resolves union-of-string-literal types"
```

---

## Task 4.4: `cx/call-resolver.ts` — dispatch by kind

**Files:**
- Create: `server/src/core/cx/call-resolver.ts`
- Create: `test/unit/cx/call-resolver.test.ts`

This is the thin glue between Phase 1 (ScssClassMap), Phase 3 (CxCallInfo), and Phase 4 (TypeResolver). It is pure dispatch — no AST walking, no I/O.

- [ ] **Step 1: Write the failing test**

Create `test/unit/cx/call-resolver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type {
  CxBinding,
  CxCallInfo,
  ResolvedType,
  ScssClassMap,
  SelectorInfo,
  Range,
} from "@css-module-explainer/shared";
import type { TypeResolver } from "../../../server/src/core/ts/type-resolver.js";
import { resolveCxCallToSelectorInfos } from "../../../server/src/core/cx/call-resolver.js";

const ZERO: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

function makeInfo(name: string): SelectorInfo {
  return {
    name,
    range: ZERO,
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: ZERO,
  };
}

function makeClassMap(names: string[]): ScssClassMap {
  return new Map(names.map((n) => [n, makeInfo(n)]));
}

function makeBinding(): CxBinding {
  return {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/a.module.scss",
    classNamesImportName: "classNames",
    scope: { startLine: 0, endLine: 100 },
  };
}

class FakeTypeResolver implements TypeResolver {
  constructor(private readonly table: Record<string, ResolvedType>) {}
  resolve(_filePath: string, variableName: string): ResolvedType {
    return this.table[variableName] ?? { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

describe("resolveCxCallToSelectorInfos / static", () => {
  it("returns the matching class for a static call", () => {
    const classMap = makeClassMap(["btn", "active"]);
    const call: CxCallInfo = {
      kind: "static",
      className: "btn",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name)).toEqual(["btn"]);
  });

  it("returns [] when a static class is missing from the class map", () => {
    const classMap = makeClassMap(["btn"]);
    const call: CxCallInfo = {
      kind: "static",
      className: "nope",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result).toEqual([]);
  });
});

describe("resolveCxCallToSelectorInfos / template", () => {
  it("returns every class whose name starts with the static prefix", () => {
    const classMap = makeClassMap([
      "weight-light",
      "weight-normal",
      "weight-bold",
      "unrelated",
    ]);
    const call: CxCallInfo = {
      kind: "template",
      rawTemplate: "`weight-${w}`",
      staticPrefix: "weight-",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    const names = result.map((i) => i.name).toSorted();
    expect(names).toEqual(["weight-bold", "weight-light", "weight-normal"]);
  });

  it("returns [] when no class matches the prefix", () => {
    const classMap = makeClassMap(["btn", "link"]);
    const call: CxCallInfo = {
      kind: "template",
      rawTemplate: "`size-${s}`",
      staticPrefix: "size-",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result).toEqual([]);
  });

  it("returns every class when the static prefix is empty", () => {
    // `cx(`${name}-suffix`)` — staticPrefix is empty so every
    // class starts with it. Matches every class in the map.
    const classMap = makeClassMap(["a", "b"]);
    const call: CxCallInfo = {
      kind: "template",
      rawTemplate: "`${name}-suffix`",
      staticPrefix: "",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name).toSorted()).toEqual(["a", "b"]);
  });
});

describe("resolveCxCallToSelectorInfos / variable", () => {
  it("resolves a union variable to each existing class", () => {
    const classMap = makeClassMap(["small", "medium", "large"]);
    const call: CxCallInfo = {
      kind: "variable",
      variableName: "size",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({
        size: { kind: "union", values: ["small", "medium", "large"] },
      }),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name).toSorted()).toEqual(["large", "medium", "small"]);
  });

  it("drops union members that are missing from the class map", () => {
    // Partial mismatch: the resolver returns a superset of what
    // the class map actually has. call-resolver filters undefined
    // lookups silently; Phase 9's diagnostic layer handles the
    // reporting when reportPartialUnionMismatch is enabled.
    const classMap = makeClassMap(["small", "medium"]);
    const call: CxCallInfo = {
      kind: "variable",
      variableName: "size",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({
        size: { kind: "union", values: ["small", "medium", "large"] },
      }),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name).toSorted()).toEqual(["medium", "small"]);
  });

  it("returns [] for an unresolvable variable", () => {
    const classMap = makeClassMap(["small"]);
    const call: CxCallInfo = {
      kind: "variable",
      variableName: "x",
      originRange: ZERO,
      binding: makeBinding(),
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement `call-resolver.ts`**

Create `server/src/core/cx/call-resolver.ts`:

```ts
import type {
  CxCallInfo,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import type { TypeResolver } from "../ts/type-resolver.js";

export interface ResolveArgs {
  readonly call: CxCallInfo;
  readonly classMap: ScssClassMap;
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

/**
 * Dispatch a CxCallInfo to concrete SelectorInfo values.
 *
 * Contract:
 *   - Returns `[]` when nothing matches. Providers treat `[]` as
 *     "nothing to show" (hover → null, definition → null,
 *     diagnostics → emit warning).
 *   - Returns a non-empty list when the call can be resolved,
 *     possibly to multiple candidates (template prefixes, union
 *     variables). Providers typically display a picker or a
 *     multi-candidate hover card.
 *
 * The function is pure — no I/O, no caching, no AST walking. It
 * is the single place where Phase 1 (ScssClassMap), Phase 3
 * (CxCallInfo), and Phase 4 (TypeResolver) meet.
 */
export function resolveCxCallToSelectorInfos(args: ResolveArgs): SelectorInfo[] {
  const { call, classMap, typeResolver, filePath, workspaceRoot } = args;

  switch (call.kind) {
    case "static": {
      const info = classMap.get(call.className);
      return info ? [info] : [];
    }
    case "template": {
      const results: SelectorInfo[] = [];
      for (const info of classMap.values()) {
        if (info.name.startsWith(call.staticPrefix)) {
          results.push(info);
        }
      }
      return results;
    }
    case "variable": {
      const resolved = typeResolver.resolve(filePath, call.variableName, workspaceRoot);
      if (resolved.kind !== "union") return [];
      const results: SelectorInfo[] = [];
      for (const value of resolved.values) {
        const info = classMap.get(value);
        if (info) results.push(info);
      }
      return results;
    }
  }
}
```

- [ ] **Step 4: Run → pass, full pipeline, commit**

```bash
pnpm format && pnpm check && pnpm test && pnpm build
git add server/src/core/cx/call-resolver.ts test/unit/cx/call-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(cx): call-resolver dispatches CxCallInfo to SelectorInfo[]

server/src/core/cx/call-resolver.ts is the thin glue between
Phase 1 (ScssClassMap), Phase 3 (CxCallInfo), and Phase 4
(TypeResolver). Pure dispatch by kind:

- static   → classMap.get(name), 0-or-1 result
- template → every class whose name startsWith(staticPrefix)
- variable → typeResolver.resolve(...) → each union member
             looked up in classMap, undefined silently dropped

The function is pure and takes TypeResolver as an interface, so
provider unit tests (Plans 06+) inject a FakeTypeResolver without
needing a real ts.Program. Phase 4 is now complete; providers
can consume resolveCxCallToSelectorInfos as their single entry
point to "what classes does this cx() call reference?"
EOF
)"
```

---

## Plan 04 Completion Checklist

- [ ] `shared/src/types.ts` exports `ResolvedType`.
- [ ] `server/src/core/ts/source-file-cache.ts` exists with LRU + script-kind dispatch.
- [ ] `server/src/core/ts/type-resolver.ts` exports `TypeResolver` interface + `WorkspaceTypeResolver` implementation taking `createProgram` dependency.
- [ ] `server/src/core/cx/call-resolver.ts` exports `resolveCxCallToSelectorInfos`.
- [ ] Tests: `source-file-cache.test.ts` (LRU + script kinds), `type-resolver.test.ts` (virtual host, string literal / union / unresolvable / generic / cache), `call-resolver.test.ts` (every kind with FakeTypeResolver).
- [ ] `pnpm check && pnpm test && pnpm build` all green.
- [ ] Layer rule: `cx/call-resolver.ts` imports the `TypeResolver` interface, not the concrete class.

When every item is checked, Plan 04 is complete. Proceed to Plan 05 (indexing infrastructure + provider-utils, Phase 5).
