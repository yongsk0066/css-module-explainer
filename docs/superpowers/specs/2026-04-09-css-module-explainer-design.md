# CSS Module Explainer — 1.0 Design

**Status:** Approved brainstorm · ready for implementation planning
**Date:** 2026-04-09
**Author:** yongsk0066
**Target release:** 1.0.0 (first marketplace publish)

---

## Table of Contents

1. [Goals, Non-Goals, Target Audience](#1-goals-non-goals-target-audience)
2. [Architecture](#2-architecture)
3. [Core Modules](#3-core-modules)
4. [Providers](#4-providers)
5. [Data Flow Walkthroughs](#5-data-flow-walkthroughs)
6. [Configuration & Public API](#6-configuration--public-api)
7. [Performance & Responsiveness](#7-performance--responsiveness)
8. [Testing Strategy](#8-testing-strategy)
9. [Phase Plan](#9-phase-plan)
10. [Risks, Open Questions & Future Work](#10-risks-open-questions--future-work)

---

## Context

VS Code LSP extension providing Go-to-Definition / Hover / Autocomplete / Diagnostics (and, in Phase Final, Find References + CodeLens) for `classnames/bind`'s `cx()` pattern used with CSS Modules.

```tsx
import classNames from 'classnames/bind';
import styles from './Button.module.scss';

const cx = classNames.bind(styles);

<div className={cx('button', { active: isActive })}>Click me</div>
```

Existing CSS Modules extensions handle `styles.className` direct access but lose track when the chain goes through `classnames.bind()`. This extension fills that specific gap, at a production-quality bar.

**Toolchain (locked):**
`@types/node@^25.5.0`, `@types/vscode@^1.115.0`, `@vscode/vsce@^3.7.1`, `oxfmt@^0.44.0`, `oxlint@^1.59.0`, `rolldown@1.0.0-rc15`, `typescript@^6.0.2`, `vitest@^4.1.3`, `vscode-languageserver@^9.0.1`, `vscode-languageserver-textdocument@^1.0.12`, `postcss@^8.5.9`, `postcss-scss@^4.0.9`, `pnpm@10.30.3`.

**Reference implementation:** An earlier internal build (`css-modules-lens` v0.0.2) validated the LSP architecture and core algorithms. Its structure is reused, but this 1.0 is a clean rebuild aiming for production completeness rather than MVP parity.

---

## 1. Goals, Non-Goals, Target Audience

### 1.1 Goals (1.0 release gates)

**G1. Four LSP features at production quality**
- Go-to-Definition — `cx('className')` → `.module.scss|css` selector
- Hover — markdown preview with full SCSS rule, file location, multi-candidate support
- Autocomplete — rich class completions inside `cx()`, object keys, with detail/documentation
- Diagnostics — unknown-class warnings with Levenshtein "Did you mean?" suggestions

**G2. `cx()` pattern breadth**
String literal · Object key · Conditional (`&&`/`?:`) · Template literal (prefix match) · Union variable (TS union literal resolution) · Spread/Array/multi-arg · Multi-line calls (AST-based)

**G3. Style language breadth**
`.module.scss` + `.module.css` (B), with a parser-switching layer that makes LESS addition a single registry entry. SCSS/CSS edge cases handled: `:global()` excluded, `:local()` included, `&` nesting, group selectors, `@media`/`@at-root` unwrapping, cascade last-wins, `@keyframes` excluded, CSS variable declarations shown in hover.

**G4. `cx` binding robustness**
Variable names free, default-import names free, multiple bindings per file, styles names free, function-scoped bindings (AST scope walker).

**G5. Measured responsiveness (CI-enforced)**
- First hover (cache miss): **< 150ms p95**
- Second hover (cache hit): **< 5ms p95**
- Edit → diagnostics push: **< 300ms p95** (includes 200ms debounce)
- Union variable resolution (ts.Program warm): **< 50ms p95**
- 100 SCSS files pre-warm: **< 2000ms p95**

**G6. Find References (Phase Final)**
`N references` CodeLens (TypeScript-style) above each `.module.scss` class selector. Shift+F12 / Peek References jumping to all `cx()` call sites across the workspace. Workspace background indexer + file watcher + incremental updates. Implementation order: last. Earlier phases use a `NullReverseIndex` seam so provider code needs zero changes when the real index lands.

**G7. Three-tier testing model**
- **Tier 1 (Unit, vitest):** core branches ≥ 80%, providers ≥ 60%
- **Tier 2 (Protocol, vitest + in-process LSP):** capability contract regression, 30+ scenarios
- **Tier 3 (E2E, `@vscode/test-electron` + mocha):** VS Code spin-up, 15+ scenarios

**G8. `examples/` dogfood sandbox**
Nine scenario sub-packages under a Vite+ root, used for manual QA and as Tier 3 fixture reuse.

### 1.2 Non-Goals

- **NG2.** Rename refactoring.
- **NG3.** `composes:` cross-file chain tracing.
- **NG4.** CSS value autocompletion / linting (not our domain).
- **NG5.** Dynamic merge `cn.bind({ ...a, ...b })`.
- **NG6.** Named bind import (`import { bind } from 'classnames'`).
- **NG7.** Workspace-wide diagnostics enabled by default. Schema-only opt-in; at runtime falls back to open-document scope with a warning log.
- **NG8.** Other class-name utilities (`clsx`, `cva`, `tailwind-variants`). Considered for future.
- **NG9.** Non-`file:` URI schemes (`vscode-remote`, `github.dev`, `untitled`).

### 1.2.1 Future Considerations (1.0 must not architecturally block)

**FC1. Direct `styles.className` member access.**
Deliberately deferred. Reasoning:
- All Q2-Q9 decisions are anchored on a `cx(...)` call site; `styles.className` is a `PropertyAccessExpression` with different triggers, fixtures, and edge cases — effectively a separate feature set.
- Architecture already does not block it:
  1. `cx-binding-detector` already tracks the `styles` import chain (var name + SCSS path).
  2. `scss-index` returns a domain-neutral "class name → SelectorInfo" map, not cx-specific.
  3. `document-analysis-cache` parses a full TS AST; `PropertyAccessExpression` nodes are already walkable.
  4. New provider would be ~one new file (`styles-access-parser.ts`) plus a member-access branch in each existing provider.
- **1.0 does not build FC1-specific seams** (unlike Phase Final). The requirement is just neutral naming and composable provider internals — this falls out naturally.

**FC2. `clsx` support.**
Same structural shape as FC1. 1.1+ re-evaluation.

### 1.3 Target Audience

Primary: React/TSX projects using CSS Modules with `classnames/bind`. Secondary: JSX/JS variants (without union variable resolution). The user opens a component file and expects zero-config behavior: install → open → it just works.

---

## 2. Architecture

### 2.1 Process model

Standard VS Code LSP two-process split. Client (extension host) runs `client/src/extension.ts`, spawns server via `child_process.fork` with `TransportKind.ipc`. Server lives in `server/src/server.ts`.

```
Extension Host (VS Code)              Language Server (Node.js)
─────────────────────────             ─────────────────────────
client/src/extension.ts     ◄──IPC──► server/src/server.ts
  • activate()               JSON-RPC   • createConnection(ProposedFeatures.all)
  • LanguageClient bootstrap            • TextDocuments(TextDocument)
  • config sync                         • onInitialize / capabilities
  • documentSelector: tsx/jsx/ts/js/    • provider dispatch
    scss/css (scheme: file)             • cache state
```

**Document selector:** `typescriptreact`, `javascriptreact`, `typescript`, `javascript`, `scss`, `css` — all `scheme: 'file'`. SCSS/CSS are registered from day one (Phase Final CodeLens target); handlers are no-ops until Phase Final.

**Synchronize section:** `cssModuleExplainer`.

**Client is "dumb":** bootstrap + config sync + command registration. Zero business logic.

### 2.2 Layering

```
Layer 0  Transport           vscode-languageserver/node
Layer 1  Providers           definition · hover · completion · diagnostics · code-actions
                             [Phase Final] references · reference-lens
                             provider-utils.withCxCallAtCursor (shared cursor path)
Layer 2  Core                scss/ (lang-registry, scss-index)
                             cx/ (binding-detector, call-parser, call-resolver)
                             ts/ (source-file-cache, type-resolver)
                             indexing/ (document-analysis-cache, reverse-index, indexer-worker)
                             util/ (text-utils)
Layer 3  Shared Types        shared/src/types.ts (data only, no runtime)
```

**Import rules (lint-enforced):**
- Layer 1 imports Layer 2 public API only.
- Layer 2 cross-domain access goes through interfaces (e.g., `cx/call-resolver` depends on `TypeResolver` interface, not the class).
- Layer 3 has zero runtime code — only types. Any layer may import it.
- Layer 0 knows Layer 1 but not Layer 2.

### 2.3 Composition root & dependency injection

`server.ts` is the single composition root. All caches, resolvers, indexers are instantiated once there and injected into provider handlers via a `ProviderDeps` bag. Providers are pure `(params, deps) → result` functions — no global singletons.

```ts
const analysisCache    = new DocumentAnalysisCache({ max: 200 });
const scssIndexCache   = new StyleIndexCache({ max: 500 });
const sourceFileCache  = new SourceFileCache({ max: 200 });
const typeResolver     = new WorkspaceTypeResolver();
const reverseIndex     = new NullReverseIndex();           // Phase Final → WorkspaceReverseIndex
const indexerWorker    = new IndexerWorker({
  supplier:  () => scssFileSupplier(workspaceRoot),        // Phase Final → concat(scss, tsx)
  onScssFile,
  onTsxFile,  // Phase Final
});

const deps: ProviderDeps = { analysisCache, scssIndexCache, sourceFileCache,
                             typeResolver, reverseIndex, indexerWorker,
                             readStyleFile, workspaceRoot, config, logger };

connection.onDefinition(p => toPromise(handleDefinition(toCursor(p), deps)));
// ...
```

Phase Final swap points are explicit: `reverseIndex` instance and `indexerWorker.supplier`. Provider code unchanged.

### 2.4 `DocumentAnalysisCache` — per-file single-parse hub

Every provider's shared front stage is "map cursor to CxCallInfo". That work is performed at most once per (`uri`, `content-version`) via `DocumentAnalysisCache`.

```ts
interface AnalysisEntry {
  contentHash: string;
  version:     number;     // VS Code TextDocument.version (O(1) hot-path key)
  sourceFile:  ts.SourceFile;
  bindings:    CxBinding[];
  calls:       CxCallInfo[];
}
```

Providers call `deps.analysisCache.get(uri, content, filePath, version)`. Second hover on the same token costs < 1 ms.

### 2.5 Two-tier TypeScript usage

| | In-flight tier | Workspace tier |
|---|---|---|
| **Use** | cx parsing, binding detection | `cx(unionVar)` union literal resolution |
| **API** | `ts.createSourceFile(uri, content, …, /*setParents*/ true)` | `ts.createProgram()` + `TypeChecker` |
| **Input** | Unsaved editor text (live) | tsconfig-based disk files |
| **Cache** | `SourceFileCache` (uri + hash) | `TypeResolver.programCache` |
| **Invalidation** | Document change | `tsconfig.json` change, save |
| **Cost** | A few ms per file | Hundreds of ms to seconds for program creation, then tens of ms per lookup |

Separating the two prevents a whole class of bug ("hover works but union doesn't") and keeps the hot path responsive on unsaved edits.

### 2.6 `IndexerWorker` — supplier-swappable background loop

Single class, non-blocking loop, yields to event loop via `setImmediate` between each file so incoming LSP requests always preempt. Initial supplier: `scssFileSupplier(root)` only. Phase Final replaces it with `concat(scssFileSupplier, tsxFileSupplier)`. Worker internals unchanged.

File-watcher-driven `pushFile(task)` lets incremental updates jump the queue.

### 2.7 Cache topology

```
DocumentAnalysisCache (LRU 200)
   uri → { sourceFile, bindings, calls, hash, version }
      │
      ▼
SourceFileCache         StyleIndexCache       TypeResolver
(LRU 200)               (LRU 500)             .programCache
uri → ts.SourceFile     path → ClassMap       root → ts.Program

ReverseIndex (Phase Final)
  scssPath → Map<className, Set<CallSite>>
  + reverse pointer: uri → Set<{scssPath, className}>  (O(1) forget)
```

**Invalidation rules:**

| Event | Invalidated |
|---|---|
| `.tsx/.jsx` change (editor) | `DocumentAnalysisCache[uri]`, `SourceFileCache[uri]`, `ReverseIndex.forget(uri)` |
| `.tsx/.jsx` save | + workspace `ts.Program` invalidate (debounced) |
| `.module.scss|css` change | `StyleIndexCache[path]` + re-validate importing docs |
| `tsconfig.json` change | `TypeResolver.programCache.clear()` + re-validate all open docs |

### 2.8 Error isolation

- **Handler-level top-level try/catch** in every provider. On exception: log + return empty result (`null` / `[]`). Server never crashes.
- **SCSS parse error** is file-scoped: bad file logged and skipped; other files unaffected. Fallback attempt with vanilla postcss (many SCSS-looking files are valid CSS subsets).
- **TS Program creation failure** → `TypeResolver` returns `{ kind: 'unresolvable', values: [] }` for all variable lookups. Static cases still work.
- **In-flight document disappears** (tab close) → `onDidClose` invalidates analysis cache and cancels pending diagnostics timer.

### 2.9 Architectural decisions summary

| # | Decision | Rationale |
|---|---|---|
| A1 | LSP 2-process | VS Code ecosystem standard, previously validated |
| A2 | 4 layers + import direction rule | Test isolation + Phase Final swap boundary |
| A3 | Single composition root + DI bag | Pure-function providers, easy to mock |
| A4 | `DocumentAnalysisCache` as single parse entry | "One parse per file" responsiveness principle |
| A5 | TS 2-tier (in-flight / workspace) | Live text + type checker both |
| A6 | Supplier-swappable `IndexerWorker` | Phase Final = zero code change in worker |
| A7 | `NullReverseIndex` default | Phase Final seam without runtime cost in early phases |
| A8 | No runtime in shared/types | Break cyclic imports; type-only module |
| A9 | Top-level try/catch per handler | One handler failure never kills the server |

---

## 3. Core Modules

### 3.1 Dependency graph

```
                    util/text-utils
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   scss/lang-     ts/source-file-  cx/binding-
   registry          cache           detector
          │               │               │
          ▼               ▼               ▼
   scss/scss-    ts/type-         cx/call-
   index          resolver          parser
          │               │               │
          └───────────────┼───────────────┘
                          ▼
                 cx/call-resolver
                          │
                          ▼
              indexing/ (document-analysis-cache,
                         reverse-index,
                         indexer-worker)
```

Arrows are permitted import directions; reverse imports are forbidden.

### 3.2 `scss/lang-registry.ts`

```ts
export interface StyleLang {
  readonly id:          'scss' | 'css';
  readonly extensions:  readonly string[];
  readonly syntax:      postcss.Syntax | null;
  readonly displayName: string;
}

export const STYLE_LANGS: readonly StyleLang[] = [
  { id: 'scss', extensions: ['.module.scss'], syntax: postcssScss, displayName: 'SCSS' },
  { id: 'css',  extensions: ['.module.css'],  syntax: null,        displayName: 'CSS'  },
];

export function getAllStyleExtensions(): readonly string[];
export function findLangForPath(filePath: string): StyleLang | null;
export function buildStyleImportRegex(): RegExp;
export function buildStyleFileWatcherGlob(): string;
```

Frozen constant; no runtime additions. LESS addition = one entry. Consumers (`cx-binding-detector`, file watcher glob, SCSS parser) read from the registry — no hardcoded `.scss` literals anywhere else.

### 3.3 `scss/scss-index.ts`

```ts
export interface SelectorInfo {
  readonly name:         string;  // 'button--primary' after & resolution
  readonly range:        Range;   // class token position
  readonly fullSelector: string;
  readonly declarations: string;  // 'color: red; font-size: 14px'
  readonly ruleRange:    Range;   // full { ... } block (for peek view)
}

export type ScssClassMap = ReadonlyMap<string, SelectorInfo>;

export function parseStyleModule(content: string, filePath: string): ScssClassMap;

export class StyleIndexCache {
  get(filePath: string, content: string): ScssClassMap;
  invalidate(filePath: string): void;
  clear(): void;
}
```

**Edge cases implemented (Q6 B):**

| # | Case | Handling |
|---|---|---|
| 1 | `:global(.foo)` | Skip (exclude from map) |
| 2 | `:local(.foo)` | Unwrap, include |
| 4 | `&` nesting | `resolveSelector(raw, parent)` chain resolution |
| 6 | `.a, .b` group | Split by comma, index each with same declarations |
| 7 | CSS variable declarations | Include in declarations text |
| 8 | Cascade duplicates | **Last-wins** (inverts previous first-wins) |
| 9 | `@keyframes` / `@font-face` | Auto-excluded (`rule.type === 'atrule'`) |
| 10 | `@media` / `@at-root` wrappers | Recurse into inner rules |

Parse errors: catch at file boundary, log, return empty map, attempt vanilla-postcss fallback.

### 3.4 `cx/binding-detector.ts`

```ts
export interface CxBinding {
  readonly cxVarName:            string;   // 'cx', 'classes', 'cxBtn'
  readonly stylesVarName:        string;   // 'styles', 'btn', 'formStyles'
  readonly scssModulePath:       string;   // absolute, resolved
  readonly scope:                { startLine: number; endLine: number };
  readonly classNamesImportName: string;   // 'classNames' or 'cn'
}

export function detectCxBindings(sourceFile: ts.SourceFile, filePath: string): CxBinding[];
```

Two-pass AST walk:
1. **Pass 1:** scan `ImportDeclaration` nodes for `classnames/bind` default import names and for any `*.module.{scss,css}` default imports (using `lang-registry.getAllStyleExtensions()`).
2. **Pass 2:** walk all `VariableDeclaration` nodes whose initializer is `<classNamesName>.bind(<stylesVar>)`. Record the enclosing function (or source file) as the binding scope — covers Q7 B #7 (function-scoped bindings).

Handles Q7 B cases 1, 2, 3, 5, 6, 7 automatically via AST. Cases 4, 8, 9, 10, 11 explicitly unsupported (NG5, NG6, rare).

### 3.5 `cx/call-parser.ts`

```ts
export type CxCallInfo = StaticClassCall | TemplateLiteralCall | VariableRefCall;

interface CxCallBase {
  readonly originRange: Range;     // LSP highlight range (e.g., 'indicator' token, quotes excluded)
  readonly binding:     CxBinding;
}

export interface StaticClassCall     extends CxCallBase { kind: 'static';   className: string }
export interface TemplateLiteralCall extends CxCallBase { kind: 'template'; rawTemplate: string; staticPrefix: string }
export interface VariableRefCall     extends CxCallBase { kind: 'variable'; variableName: string }

export function parseCxCalls(sourceFile: ts.SourceFile, binding: CxBinding): CxCallInfo[];
```

AST walk: find every `CallExpression` whose expression is `Identifier === binding.cxVarName` and whose location lies within `binding.scope`. Per argument:

| Argument type | Handling |
|---|---|
| `StringLiteral` / `NoSubstitutionTemplateLiteral` | `static` |
| `ObjectLiteralExpression` | Each property name → `static` |
| `BinaryExpression(&&)` / `ConditionalExpression(?:)` | Recurse both branches |
| `TemplateExpression` | Head text → `staticPrefix` → `template` |
| `Identifier` | `variable` with identifier name |
| `ArrayLiteralExpression` | Recurse elements (Q3 D) |
| `SpreadElement` | If inner is array literal, recurse elements; else skip (Q3 D) |
| Other | Skip (untraceable) |

**Multi-line is free** — AST is line-agnostic. Comments and strings never confuse it — a fundamental break with regex-based parsing.

**originRange computation:** for `StringLiteral` use inside-quote range; for object key use property name range; for template literal use the full backtick range; for identifier use the identifier range. LSP `Position` is 0-based; conversion via `ts.getLineAndCharacterOfPosition`.

### 3.6 `cx/call-resolver.ts`

```ts
export function resolveCxCallToSelectorInfos(args: {
  call:          CxCallInfo;
  classMap:      ScssClassMap;
  typeResolver:  TypeResolver;
  filePath:      string;
  workspaceRoot: string;
}): SelectorInfo[];
```

Dispatch by `call.kind`:
- `static` → `classMap.get(name)` → 0 or 1 info
- `template` → filter `classMap.values()` by `name.startsWith(staticPrefix)`, capped at `config.analysis.maxDynamicCandidates` (default 20)
- `variable` → `typeResolver.resolve(filePath, variableName, workspaceRoot)` → for each union literal, `classMap.get(v)`, filter undefined

Return `[]` when nothing matches; providers interpret empty as "nothing to show" and diagnostics interpret it as a warning source.

### 3.7 `ts/source-file-cache.ts` + `ts/type-resolver.ts`

**`SourceFileCache`** (in-flight tier) — LRU of `ts.SourceFile` parsed with `setParentNodes: true`. ScriptKind chosen by extension (`.tsx` → TSX, `.jsx` → JSX, etc.).

**`TypeResolver`** interface + `WorkspaceTypeResolver` implementation. `resolve()` flow:
1. `getOrCreateProgram(workspaceRoot)` — `ts.findConfigFile` → `ts.parseJsonConfigFileContent` → `ts.createProgram`. Fallback: `{ allowJs: true, jsx: ReactJSX }`.
2. `program.getSourceFile(filePath)` + `getTypeChecker()`.
3. Find `Symbol` for `variableName` (destructure, parameter, variable declaration — all three).
4. `checker.getTypeOfSymbol(symbol)` → classify:
   - `isStringLiteralType` → `{ kind: 'union', values: [type.value] }`
   - `isUnion` with all members string literal → `{ kind: 'union', values: [...] }`
   - Generic → `getBaseConstraintOfType` retry
   - Otherwise → `{ kind: 'unresolvable', values: [] }`

`warmUp(workspaceRoot)` is called from `onInitialized` to build the program in the background; first user request is often a cache hit.

### 3.8 `indexing/document-analysis-cache.ts`

```ts
export class DocumentAnalysisCache {
  constructor(deps: {
    sourceFileCache:  SourceFileCache;
    bindingDetector:  typeof detectCxBindings;
    callParser:       typeof parseCxCalls;
    max:              number;
  });
  get(uri: string, content: string, filePath: string, version: number): AnalysisEntry;
  invalidate(uri: string): void;
  clear(): void;
}
```

- **Primary key:** `TextDocument.version` (monotonic, O(1)).
- **Fallback key:** `md5(content)` when version miss.
- `invalidate(uri)` cascades to `sourceFileCache.invalidate(uri)`.

### 3.9 `indexing/reverse-index.ts`

```ts
export interface CallSite {
  uri: string; range: Range; binding: CxBinding;
  kind: CxCallInfo['kind']; matchInfo: string;
}

export interface ReverseIndex {
  record(uri: string, calls: CxCallInfo[], scssPathForClass: (n: string) => string | null): void;
  forget(uri: string): void;
  find(scssPath: string, className: string): CallSite[];
  count(scssPath: string, className: string): number;
  clear(): void;
}

export class NullReverseIndex implements ReverseIndex { /* no-op */ }
// Phase Final:
export class WorkspaceReverseIndex implements ReverseIndex { /* Map + reverse pointer */ }
```

**Contract:** `record()` is idempotent per `uri` — auto-forgets prior contributions. `find`/`count` do O(1) lookup by exact `(scssPath, className)` key; static calls record the exact class name, template calls record each matching prefix expansion, variable calls record each resolved union value.

`NullReverseIndex` lets providers call `record()` unconditionally from day one. When Phase Final lands, open documents are already "indexed" the moment the real index is swapped in.

### 3.10 `indexing/indexer-worker.ts`

```ts
export interface IndexerWorker {
  start(): Promise<void>;       // fire-and-forget background loop
  pushFile(task: FileTask): void;
  stop(): void;
}
```

Internals:
- `for await (task of supplier())` + `setImmediate` yield before each file → LSP requests preempt naturally.
- Incremental `pushFile()` inserts into a priority queue for file-watcher-driven updates.
- `stop()` cancels the loop on LSP shutdown.

### 3.11 `util/text-utils.ts`

```ts
export function getLineAt(content: string, lineNumber: number): string | undefined;
export function pathToFileURL(path: string): string;
export function fileURLToPath(url: string): string;
export function levenshteinDistance(a: string, b: string): number;
export function findClosestMatch(target: string, candidates: Iterable<string>, maxDistance?: number): string | null;
```

Pure, side-effect-free, table-test friendly. `findClosestMatch` default `maxDistance = 3`.

### 3.12 Module size budget

| File | src LOC | Test weight | Complexity |
|---|---|---|---|
| `scss/lang-registry` | ~50 | Low | Low |
| `scss/scss-index` | ~300 | **High** | **High** |
| `cx/binding-detector` | ~200 | **High** | Medium |
| `cx/call-parser` | ~350 | **High** | **High** |
| `cx/call-resolver` | ~80 | Medium | Low |
| `ts/source-file-cache` | ~60 | Low | Low |
| `ts/type-resolver` | ~200 | **High** | Medium |
| `indexing/document-analysis-cache` | ~100 | Medium | Low |
| `indexing/reverse-index` | ~50 (Null) / ~200 (Workspace) | **High** | Medium |
| `indexing/indexer-worker` | ~150 | Medium | Medium |
| `util/text-utils` | ~80 | High | Low |
| **Total** | **~1,400 – 1,800** | | |

---

## 4. Providers

### 4.1 `provider-utils.ts` — shared cursor path

```ts
export interface CursorParams {
  documentUri: string; content: string; filePath: string;
  line: number; character: number;
}

export interface ProviderDeps {
  analysisCache:  DocumentAnalysisCache;
  scssIndexCache: StyleIndexCache;
  sourceFileCache:SourceFileCache;
  typeResolver:   TypeResolver;
  reverseIndex:   ReverseIndex;
  readStyleFile:  (path: string) => string | null;
  workspaceRoot:  string;
  config:         ResolvedConfig;
  logger:         Logger;
}

export interface CxCallContext {
  call:     CxCallInfo;
  binding:  CxBinding;
  classMap: ScssClassMap;
  entry:    AnalysisEntry;
}

export function withCxCallAtCursor<T>(
  params: CursorParams,
  deps:   ProviderDeps,
  transform: (ctx: CxCallContext) => T | null,
): T | null;
```

**Fast path** (early exits before AST work):
1. If `!content.includes('classnames/bind')` → `null`.
2. If the cursor line has no `(` → `null`.
3. Only then call `analysisCache.get()`.

Most hover requests live in the fast path and cost < 0.1 ms.

### 4.2 `definition.ts`

Returns `LocationLink[] | null`. For each resolved `SelectorInfo`:
```ts
{
  originSelectionRange: call.originRange,       // 'indicator' in source
  targetUri:            pathToFileURL(binding.scssModulePath),
  targetRange:          info.ruleRange,         // full SCSS rule block (peek)
  targetSelectionRange: info.range,             // class token (caret position)
}
```

Multi-match (template / variable) returns all LocationLinks; VS Code auto-shows a picker. Empty match → `null` (diagnostic provider handles reporting).

### 4.3 `hover.ts` + `hover-renderer.ts`

Returns `Hover { range: call.originRange, contents: { kind: 'markdown', value } }`.

**Single-match markdown:**
````
**`.indicator`** — _Button.module.scss:12_

```scss
.indicator {
  color: red;
  font-size: 14px;
}
```
````

**Multi-match markdown (template / variable):**
Header `**N matches** for \`cx(\`...\`)\`` followed by per-candidate sections. Cap at `config.hover.maxCandidates` (default 10), with `…and N more` tail. For `variable`, header includes the type summary: `size: 'small' | 'medium'`.

`formatScssPath` strips absolute paths to workspace-relative (privacy).

### 4.4 `completion.ts`

Returns `CompletionItem[] | null`. Pipeline:
1. `analysisCache.get()` → bindings.
2. Extract `textBefore = line.slice(0, character)`.
3. `isInsideCxCall(textBefore, binding.cxVarName)` — find the last `cxVarName(` in `textBefore`, then count unclosed parens; if `depth > 0`, we're inside.
4. `scssIndexCache.get()` → classMap.
5. Map classMap values to CompletionItems:

```ts
{
  label: 'indicator',
  kind: CompletionItemKind.Value,
  detail: 'color: red; font-size: 14px',
  documentation: { kind: 'markdown', value: <single-match template> },
  sortText: 'indicator',     // alphabetical
  insertText: 'indicator',
  filterText: 'indicator',
}
```

Trigger characters: `'`, `"`, `` ` ``, and `,` (controlled by `config.completion.triggerOnComma`). Object keys inside `cx({ | })` work via the same `isInsideCxCall` gate — `{` doesn't affect paren depth.

### 4.5 `diagnostics.ts`

Push-based: `onDidChangeContent` → `scheduleValidation(uri)` → 200 ms debounce → `validateDocument(uri)` → `publishDiagnostics`.

**validateCall dispatch:**

| kind | Check | Message template |
|---|---|---|
| `static` | `classMap.has(className)` | `Class '.${name}' not found in ${file}${hint}` |
| `template` | any key `startsWith(prefix)` | `No class starting with '${prefix}' found in ${file}` |
| `variable` | `ResolvedType.kind === 'union'` and values all present (or, with `reportPartialUnionMismatch = true`, any missing) | `Missing class for union member: ${...}` |

**"Did you mean?" hint:** `findClosestMatch(name, classMap.keys(), maxDistance = 3)`. Attach to `Diagnostic.data.suggestion` for Quick Fix use (section 4.5b).

**`{ kind: 'unresolvable' }` handling:** by default `ignoreUnresolvableUnions = true` — skip. Setting to `false` emits an info-level diagnostic.

**Clear-on-fix:** `publishDiagnostics` with empty array must be sent when the validation pass finds zero issues (clears previous warnings).

### 4.5b `code-actions.ts` (Quick Fix)

`codeActionProvider: { codeActionKinds: ['quickfix'], resolveProvider: false }`. Consumes `Diagnostic.data.suggestion` and returns a `CodeAction` that does a single-range text edit replacing the original class name with the suggestion. Title: `Replace with '${suggestion}'`.

### 4.6 `references.ts` — Phase Final

Responds to `textDocument/references` when the cursor sits on a class selector inside a `.module.scss|css`. Pipeline:
1. `findLangForPath(filePath)` — bail if not a style file.
2. `scssIndexCache.get()` → find the `SelectorInfo` whose `range` contains the cursor.
3. `reverseIndex.find(filePath, info.name)` → convert to `Location[]`.

### 4.7 `reference-lens.ts` — Phase Final

Responds to `textDocument/codeLens` on style files. For each `SelectorInfo` in the file:
```ts
{
  range: { start: info.range.start, end: info.range.start },
  command: {
    title: count === 0 ? 'no references' : `${count} reference${count>1?'s':''}`,
    command: 'editor.action.showReferences',
    arguments: [uri, info.range.start, deps.reverseIndex.find(filePath, info.name).map(toLocation)],
  }
}
```

`resolveProvider: false` for simplicity; all data included in the first-pass response.

### 4.8 Capability registration

```ts
return {
  capabilities: {
    textDocumentSync: { openClose: true, change: Incremental, save: { includeText: false } },
    definitionProvider: config.features.definition,
    hoverProvider:      config.features.hover,
    completionProvider: config.features.completion && {
      triggerCharacters: ['\'', '"', '`', ...(config.completion.triggerOnComma ? [','] : [])],
      resolveProvider:   false,
    },
    codeActionProvider: config.features.diagnostics && {
      codeActionKinds: ['quickfix'],
      resolveProvider: false,
    },
    referencesProvider: config.features.references || undefined,
    codeLensProvider:   config.features.references ? { resolveProvider: false } : undefined,
  },
  serverInfo: { name: 'css-module-explainer', version: SERVER_VERSION },
};
```

Dynamic registration is not used; capability changes require restart.

---

## 5. Data Flow Walkthroughs

Four representative traces. Timing annotations let us check the section 7 targets.

### 5.1 Cold start → first `cx('indicator')` hover

```
t=0     VS Code launches, extension activates
        LanguageClient.start() → forks server module
t~80    server.ts booted; deps composed
t~100   initialize request received
        onInitialize returns capabilities  ← P1 checkpoint
t~110   onInitialized:
          indexerWorker.start() (fire-and-forget)
          typeResolver.warmUp(workspaceRoot) (fire-and-forget)
t~120   Button.tsx didOpen → scheduleValidation (200 ms debounce armed)
t~250   user hovers cx('indicator')
        handleHover → withCxCallAtCursor:
          (1) analysisCache.get() miss
              ↳ sourceFileCache.get → ts.createSourceFile  ~8 ms
              ↳ detectCxBindings                           ~5 ms
              ↳ parseCxCalls                               ~3 ms
              ~16 ms total
          (2) binding scope check → pass
          (3) call at cursor → StaticClassCall 'indicator'
          (4) styleIndexCache.get → pre-warm hit (0 ms) or miss (~5 ms)
          (5) resolveCxCallToSelectorInfos → [info]
          (6) renderSingleMatch → markdown
        ~18 ms response  ← P2 checkpoint
t~320   debounce fires → validateDocument → publishDiagnostics  ← P4
```

Second hover on the same token: full cache hit, < 1 ms. ← P3.

### 5.2 `cx(size)` Go-to-Definition (union variable, multi-match)

```
handleDefinition → withCxCallAtCursor:
  analysisCache.get → hit (already parsed during hover)
  cursor → VariableRefCall { variableName: 'size' }
  classMap = styleIndexCache.get → hit
  resolveCxCallToSelectorInfos:
    typeResolver.resolve('/.../Button.tsx', 'size', workspaceRoot):
      program = getOrCreateProgram (warmUp cache hit, ~0 ms)
      sourceFile = program.getSourceFile(...)
      checker = program.getTypeChecker()
      findSymbol → symbol
      extractStringLiterals:
        type.isUnion → true
        literals → ['small', 'medium', 'large']
        return { kind: 'union', values: ['small','medium','large'] }
      ~5 ms (warm) / 1-3 s (first call)
    values.map(v => classMap.get(v)).filter(Boolean)
      → [info_small, info_medium, info_large]
  infos.length === 3
  build LocationLink[] with originSelectionRange/targetSelectionRange
→ VS Code picker with 3 entries
```

**Partial mismatch (e.g., `large` missing):** resolver returns 2 links; diagnostic provider in parallel emits `Missing class for union member: 'large'` (with `reportPartialUnionMismatch = true`).

### 5.3 Edit → Diagnostics push

```
t=0     user types 'r' (cx('indicator') → cx('indicatorr'))
        onDidChangeContent:
          analysisCache.invalidate(uri)
          sourceFileCache.invalidate(uri)
          reverseIndex.forget(uri)  (null-op in early phases)
          scheduleValidation(uri):
            clear pending timer
            setTimeout(validate, 200)
t<200   more typing → timer keeps resetting (debounce)
t~400   debounce fires
        validateDocument:
          analysisCache.get → cache miss → re-parse (~16 ms)
          styleIndexCache.get → hit
          validateCall:
            classMap.has('indicatorr') === false
            suggestion = findClosestMatch('indicatorr') = 'indicator'
            Diagnostic { range, severity: Warning,
                         message: "Class '.indicatorr' not found... Did you mean 'indicator'?",
                         data: { suggestion: 'indicator' } }
        publishDiagnostics({ uri, diagnostics: [d] })
t~420   client renders wavy underline + Problems panel entry
```

Fix: user corrects typo → another change event → same path → validateCall passes → `publishDiagnostics({ uri, diagnostics: [] })` clears the warning.

### 5.4 External `.module.scss` change

```
t=0     external vim saves Button.module.scss with .indicator removed
t~20    workspace/didChangeWatchedFiles from LSP client
        server.onDidChangeWatchedFiles:
          findLangForPath → SCSS
          styleIndexCache.invalidate(path)
          affected = documents.all().filter(doc has binding to this path)
          for doc in affected: scheduleValidation(doc.uri)
t~220   debounce fires → validateDocument(Button.tsx)
          analysisCache.get → HIT (TSX unchanged, entry reused)
          styleIndexCache.get → miss → re-parse SCSS
          validateCall fails now
          publishDiagnostics
```

**Key insight:** TSX AST is not re-parsed (nothing changed in TSX). Only the SCSS map is rebuilt. The TSX `analysisEntry` stays live throughout.

---

## 6. Configuration & Public API

### 6.1 Extension manifest

**Activation events:**
```json
[
  "onLanguage:typescriptreact", "onLanguage:javascriptreact",
  "onLanguage:typescript",      "onLanguage:javascript",
  "onLanguage:scss",            "onLanguage:css"
]
```

No `onStartupFinished` — avoid activation in unrelated projects.

**Configuration schema (`cssModuleExplainer.*`):**

```jsonc
{
  "cssModuleExplainer.enabled": { "default": true },

  "cssModuleExplainer.features.definition": { "default": true },
  "cssModuleExplainer.features.hover":      { "default": true },
  "cssModuleExplainer.features.completion": { "default": true },
  "cssModuleExplainer.features.diagnostics":{ "default": true },
  "cssModuleExplainer.features.references": { "default": false,
     "description": "(Experimental; becomes stable in 1.0 release)" },

  "cssModuleExplainer.diagnostics.severity": {
    "enum": ["error", "warning", "info", "hint"], "default": "warning" },
  "cssModuleExplainer.diagnostics.scope": {
    "enum": ["open", "workspace"], "default": "open",
    "description": "'workspace' is schema-only in 1.0; runtime falls back to 'open' with a warning." },
  "cssModuleExplainer.diagnostics.maxSuggestions": { "default": 3, "min": 0, "max": 10 },
  "cssModuleExplainer.diagnostics.ignoreUnresolvableUnions": { "default": true },
  "cssModuleExplainer.diagnostics.reportPartialUnionMismatch": { "default": true },

  "cssModuleExplainer.hover.maxCandidates": { "default": 10, "min": 1, "max": 50 },

  "cssModuleExplainer.completion.triggerOnComma": { "default": true },

  "cssModuleExplainer.analysis.debounceMs":          { "default": 200, "min": 50, "max": 2000 },
  "cssModuleExplainer.analysis.cacheSize":           { "default": 200, "min": 50, "max": 2000 },
  "cssModuleExplainer.analysis.preWarm":             { "default": true },
  "cssModuleExplainer.analysis.maxDynamicCandidates":{ "default": 20,  "min": 1, "max": 200 },

  "cssModuleExplainer.trace.server": { "enum": ["off","messages","verbose"], "default": "off" }
}
```

**Commands:**
- `cssModuleExplainer.restart` — restart language server
- `cssModuleExplainer.clearCaches` — flush all caches
- `cssModuleExplainer.revealScssFile` — open the paired `.module.scss` beside current TSX
- `cssModuleExplainer.showStats` — dump cache stats to Output channel

**Walkthroughs:** 4 steps (open component → go to def → autocomplete → catch typos), each with a walkthrough Markdown file.

**Marketplace metadata:**
- Publisher: `yongsk0066`
- Extension ID: `yongsk0066.css-module-explainer`
- Display name: `CSS Module Explainer`
- Categories: Linters, Programming Languages, Visualization
- `engines.vscode`: `^1.115.0`
- `preview: false` — 1.0 stability signal

### 6.2 LSP handshake

**Client side (`LanguageClientOptions`):**
```ts
documentSelector: [/* 6 languages, scheme: 'file' */],
synchronize: {
  configurationSection: 'cssModuleExplainer',
  fileEvents: [
    workspace.createFileSystemWatcher('**/*.module.scss'),
    workspace.createFileSystemWatcher('**/*.module.css'),
    workspace.createFileSystemWatcher('**/tsconfig.json'),
  ],
},
initializationOptions: { version: EXTENSION_VERSION },
outputChannelName: 'CSS Module Explainer',
```

**Server side:** capabilities gated by `config.features.*` booleans.

**Dynamic registration:** not used. Config changes that alter capability structure (`features.references`) require restart; user is informed.

### 6.3 Config hot-reload

`onDidChangeConfiguration` flow:
1. Parse new config.
2. Swap `deps.config` reference.
3. Selectively react:
   - `analysis.cacheSize` change → `analysisCache.resize(newSize)`
   - `features.references` change → warn "restart required"
   - `analysis.preWarm` false → true → `indexerWorker.start()`
   - `diagnostics.severity` change → re-validate all open docs

### 6.4 Legacy settings guard

If `client.getConfiguration('cssModulesLens')` is non-empty at startup, log a warning:
> `Detected legacy 'cssModulesLens.*' settings. This extension uses 'cssModuleExplainer.*'. Please migrate your settings.`

No auto-migration (bad practice to rewrite user settings).

### 6.5 Public JS API

None. `activate()` returns `undefined`. No `vscode.extensions.exports` surface.

### 6.6 Logger

Single Output channel: `CSS Module Explainer`. Log levels gated by `trace.server`:
- `off` — errors only
- `messages` — info+
- `verbose` — debug (per-request timings, cache hit/miss, indexer file events)

File paths in logs are workspace-relative (privacy).

### 6.7 Telemetry

**Zero.** No network calls. No analytics. README explicitly states this.

### 6.8 Security

- IPC only; no network.
- Runtime deps: `postcss`, `postcss-scss`, `typescript`, `vscode-languageserver`, `vscode-languageserver-textdocument`, `fast-glob`. Nothing more.
- User file content lives only in process memory. No disk caching of parsed data.

---

## 7. Performance & Responsiveness

### 7.1 Targets

| # | Path | p95 target | Gate |
|---|---|---|---|
| P1 | activate → initialize response | < 200 ms | CI |
| P2 | First document hover (miss) | < 150 ms | CI |
| P3 | Second hover (cache hit) | < 5 ms | CI |
| P4 | Edit → diagnostics push (incl. debounce) | < 300 ms | CI |
| P5 | Union variable resolution (warm program) | < 50 ms | CI |
| P6 | Union variable resolution (cold program, large repo) | < 3000 ms | nightly |
| P7 | 100 SCSS files pre-warm | < 2000 ms | nightly |
| P8 | 1000 SCSS files pre-warm | < 15000 ms | nightly |

PR gate: P1–P5 on small fixture. Nightly: P6–P8 on large fixture.

### 7.2 Hot-path optimizations

**"One parse per file":** `DocumentAnalysisCache` is the single entry; lint rule forbids direct `ts.createSourceFile` calls from providers. Enforced by test that spies on `createSourceFile` during consecutive hover → definition → completion requests and asserts it's called exactly once.

**Version-based analysis cache key:** primary key `(uri, version)`, O(1). Fallback `md5(content)` only on version miss.

**Style index content-hash:** `StyleIndexCache.get(path, content)` compares `md5(content)` — files invalidated by watcher rebuild, unchanged files are instant reuse.

**`withCxCallAtCursor` fast path:**
1. `content.includes('classnames/bind')` — skip if false (< 0.1 ms)
2. Cursor line contains `(` — skip if false
3. Only then hit the cache

90%+ of hover requests over a typical TSX file exit at fast path 1 or 2.

**CompletionItem list caching:** memoized per `(filePath, contentHash)` beside `StyleIndexCache`; markdown documentation is the most expensive piece and is cached.

### 7.3 Cold start sequence

```
t~50    extension activate
t~80    server booted (lazy-require typescript/postcss-scss deferred)
t~100   initialize response  (P1)
t~110   onInitialized:
          indexerWorker.start()
          typeResolver.warmUp(root)
t~120   didOpen first file
t~120+  user hovers → handleHover (P2 path)
          first hover may include typescript module load (~50 ms once)
t~500   scss pre-warm completes for ~100 files
t~2000  ts.Program warm-up completes
```

**Lazy require** of `typescript` (~35 MB) and `postcss-scss` — deferred until first analysis. Empty workspace costs near-zero.

### 7.4 Background worker preemption

`setImmediate` between each file processed ensures LSP request callbacks (which arrive via I/O queue) always run before the next file. Worst-case added latency for incoming hover mid-walk: ~5 ms.

**Cancellation:** handlers check `CancellationToken.isCancellationRequested` at entry and exit; not propagated into internal loops in 1.0.

### 7.5 Memory budget (single workspace, defaults)

| Cache | Max entries | Avg size | Peak |
|---|---|---|---|
| `DocumentAnalysisCache` | 200 | ~200 KB | ~40 MB |
| `SourceFileCache` | 200 | ~150 KB | ~30 MB |
| `StyleIndexCache` | 500 | ~20 KB | ~10 MB |
| `TypeResolver.programCache` | 1 | ~100 MB (large repo) | ~100 MB |
| `CompletionItemCache` | 500 | ~10 KB | ~5 MB |
| `ReverseIndex` (Phase Final) | workspace-scaled | ~200 B / call site | ~10–30 MB |
| **Total** | | | **~185 MB + reverse index** |

LRU everywhere. Resize path exists via `analysisCache.resize()`.

### 7.6 Benchmark harness

```
test/benchmark/
  _harness/{lsp-harness, measure, targets}.ts
  startup.bench.ts        (P1)
  first-hover.bench.ts    (P2)
  cached-hover.bench.ts   (P3)
  diagnostics.bench.ts    (P4)
  union-resolve.bench.ts  (P5, P6)
  prewarm.bench.ts        (P7, P8)
```

Vitest `bench()` API + tinybench internals; p50/p95/ops auto-computed. CI asserts against `targets.ts` constants.

`test/fixtures/large-repo/` is generated deterministically by `_generate.ts`; generated files are committed; re-running the script must produce zero git diff (catches accidental drift).

### 7.7 Instrumentation

- Every provider records `performance.now()` timing via `deps.stats.record(op, ms, hit)`.
- `ServerStats` keeps a rolling window (N=100) with p50/p95/max per operation.
- `cssModuleExplainer.showStats` command dumps the current snapshot to the Output channel.
- `trace.server: verbose` enables per-request detail logging.
- Sampling overhead O(1) per record — negligible.

### 7.8 Anti-patterns (code review checklist)

- Provider calling `ts.createSourceFile` directly
- `fs.readFileSync` in hot path (must go through `deps.readStyleFile` + cache)
- `new RegExp` inside functions (should be top-level const)
- Deep clones via `JSON.parse(JSON.stringify(...))`
- `Array.prototype.includes` as a lookup (use `Map.has`)
- Per-request logger instantiation
- Unbounded `setTimeout(0)` loops

Lint rule: providers cannot import `ts.createSourceFile` or `fs` directly.

---

## 8. Testing Strategy

### 8.1 Three-tier model

| Tier | Runner | Path | Input | Output | Speed | Coverage target |
|---|---|---|---|---|---|---|
| **1 Unit** | vitest 4.1.3 | `test/unit/` | Pure functions + mocked deps | Return value | < 2 s total | core ≥ 85% lines, providers ≥ 70% |
| **2 Protocol** | vitest | `test/protocol/` | In-process LSP server + JSON-RPC | LSP response / publishDiagnostics | < 15 s total | LSP contract 100% |
| **3 E2E** | `@vscode/test-electron` + mocha | `test/e2e/` | Real VS Code + workspace folder | `vscode.executeXxxProvider` result | 60–180 s total | Core UX smoke |

Tiers are additive (not duplicates): higher tiers cover what lower tiers cannot.

### 8.2 Tier 1 — Unit tests

Directory layout mirrors `server/src/`:
```
test/unit/
  scss/{lang-registry, scss-index}.test.ts
  cx/{binding-detector, call-parser, call-resolver}.test.ts
  ts/{source-file-cache, type-resolver}.test.ts
  indexing/{document-analysis-cache, reverse-index, indexer-worker}.test.ts
  util/text-utils.test.ts
  providers/{provider-utils, definition, hover, hover-renderer,
             completion, diagnostics, code-actions}.test.ts
```

**Conventions:**
- `describe` = "subject / context" (e.g., `parseStyleModule / :global() wrapping`)
- `it` = one observable fact
- Each test maps back to a Q-decision with a tag in the describe text (e.g., `(Q6 B #8)`), enabling grep-based traceability
- Inline fixtures — no filesystem from Tier 1 (except parser edge cases that need multi-file fixtures)

**Mocking policy:** use real implementations wherever possible. Mock only I/O boundaries (`fs`, `ts.Program`).
- `FakeTypeResolver` class for controlled union literal inputs
- `NullReverseIndex` is used directly (it's a real type)
- `Logger` stubbed to a no-op
- `readStyleFile` injected as an in-memory map in provider tests

**Coverage gates (V8):**
- Global: 85% lines, 85% functions, 80% branches
- `core/scss/`, `core/cx/`: 90 / 90 / 85
- `core/ts/`, `core/indexing/`: 85 / 85 / 80
- `providers/`: 70 / 70 / 60
- `util/`: 95 / 95 / 95

### 8.3 Tier 2 — Protocol tests

Goal: verify the LSP contract without launching VS Code.

**Harness (`test/protocol/_harness/in-process-server.ts`):** two `PassThrough` streams piped to each other, server started in-process with those streams, a small JSON-RPC client wrapper (`LspTestClient`) exposes `initialize`, `didOpen`, `didChange`, `hover`, `definition`, `completion`, `waitForDiagnostics`, `shutdown`. Each test gets a fresh server instance.

**Test files:**
```
lifecycle.test.ts       initialize/shutdown, capability toggling
definition.test.ts      static / template / variable scenarios (FakeTypeResolver)
hover.test.ts           single / multi / unresolvable markdown contents
completion.test.ts      trigger chars, cursor gating, object keys
diagnostics.test.ts     debounce, did-you-mean, clear-on-fix
code-actions.test.ts    quickfix from Diagnostic.data.suggestion
file-watcher.test.ts    scss/tsconfig change re-validation
pre-warm.test.ts        IndexerWorker run completes in time
```

**Real `ts.Program` is opt-in:** `type-resolver-real.test.ts` uses `WorkspaceTypeResolver` against `test/fixtures/union-variable/` with longer timeout; other tests use `FakeTypeResolver` to stay fast.

### 8.4 Tier 3 — E2E

Directory:
```
test/e2e/
  runTest.ts
  tsconfig.json (independent targets)
  suite/
    index.ts (mocha runner, required by test-electron)
    _helpers/{open-document, position, wait}.ts
    activation.test.ts
    hover.test.ts
    definition.test.ts
    completion.test.ts
    diagnostics.test.ts
    code-actions.test.ts
    commands.test.ts
    (Phase Final: references.test.ts, reference-lens.test.ts)
  workspace/
    package.json, tsconfig.json
    src/
      Button.tsx, Button.module.scss
      Form.tsx, Form.module.css
      DynamicKeys.tsx, DynamicKeys.module.scss
      UnionVariable.tsx, UnionVariable.module.scss
      Typo.tsx, Typo.module.scss
```

**`runTest.ts` pinned options:**
```ts
version: '1.115.0',          // pinned, not 'stable'
launchArgs: [
  workspacePath,
  '--disable-extensions',
  '--disable-workspace-trust',
],
```

Mocha is used (not vitest) because `@vscode/test-electron` expects the mocha-style runner exporting `async function run()`. Tests run inside the extension host; vitest is impractical there.

**Flaky management:**
- `closeAllEditors` before each test (state isolation)
- Diagnostic waits use polling (100 ms interval, 3 s max)
- `this.retries(2)` at suite level
- CI gate: main-push + nightly only (not PR)

### 8.5 Fixtures

```
test/fixtures/
  basic-scss/                basic-css/
  alias-imports/             multi-binding/
  function-scoped-binding/   multiline-cx/
  dynamic-keys/              union-variable/
  global-local-selectors/    nested-selectors/
  grouped-selectors/         cascade-last-wins/
  at-rules/                  typo-with-suggestion/
  less-slot/                 composes-chain/
  large-repo/                (500 tsx + 100 scss, _generate.ts deterministic)
```

- Tier 1 uses inline fixtures predominantly; falls back to `test/fixtures/` for scss-index edge cases.
- Tier 2 passes a fixture dir as the workspace root to the in-process server.
- Tier 3 keeps `test/e2e/workspace/` separate from fixtures for determinism.
- `examples/scenarios/` are not shared with Tier 3 (they evolve; Tier 3 must be frozen).

### 8.6 `examples/` dogfood sandbox

```
examples/
  vite.config.ts              (Vite+ root with run.tasks for 9 scenarios)
  package.json                (private workspace)
  scenarios/
    01-basic/                 02-multi-binding/
    03-multiline-heavy/       04-dynamic-keys/
    05-global-local/          06-alias-imports/
    07-function-scoped/       08-css-only/
    09-large-component/
  README.md
```

- Not an automated test target. Used for manual QA and as reference implementations of every pattern.
- Each scenario has a `pnpm vite` fallback so Vite+ (alpha) failure doesn't block dogfooding.
- CONTRIBUTING.md requires manual QA in ≥ 2 relevant scenarios for provider or parsing changes.

### 8.7 CI

**`ci.yml` — PR gate (parallel jobs):**
- `lint-typecheck`: oxlint + oxfmt --check + tsc -b
- `tier1-unit`: `pnpm test:unit --coverage`
- `tier2-protocol`: `pnpm build && pnpm test:protocol`
- `bench-fast`: P1–P5

**`e2e.yml` — main push + nightly cron:**
- `tier3-e2e`: `xvfb-run -a pnpm test:e2e`
- `bench-full`: all benchmarks including P6–P8

**`release.yml` — tag-triggered (`v*.*.*`):**
- Full test matrix + E2E + build + `vsce package` + `vsce publish` + GitHub Release

### 8.8 Test scripts

```json
{
  "test":            "pnpm test:unit",
  "test:unit":       "vitest run test/unit",
  "test:unit:watch": "vitest test/unit",
  "test:protocol":   "vitest run test/protocol",
  "test:bench":      "vitest bench test/benchmark",
  "test:e2e":        "node ./test/e2e/runTest.js",
  "test:all":        "pnpm test:unit && pnpm test:protocol && pnpm test:e2e",
  "test:coverage":   "vitest run test/unit --coverage"
}
```

Default `test` is unit-only — fastest feedback loop.

### 8.9 Release gates

| Gate | Threshold |
|---|---|
| Tier 1 coverage | core ≥ 85% lines, providers ≥ 70% |
| Tier 1 pass rate | 100% (zero flaky) |
| Tier 2 case count | ≥ 30 |
| Tier 2 pass rate | 100% |
| Tier 3 case count | ≥ 15 |
| Tier 3 pass rate | ≥ 95% (2-retry) |
| Benchmark P1–P5 | all targets met |
| Benchmark P6–P8 | all targets met (nightly) |
| Examples scenarios | 9 present, all manually verified |

1.0.0 tag creation requires every gate green.

---

## 9. Phase Plan

### 9.1 Principles

1. **Atomic merge units** — each phase is a reviewable PR leaving the repo green.
2. **Data layer before presentation layer** — core (Phase 1–5) before providers (Phase 6–9.5).
3. **Every phase ends on green CI** — no "I'll fix it next phase".
4. **Phase Final seams land in Phase 5** — `ReverseIndex` interface + `NullReverseIndex` live from early on; providers call `record()` unconditionally.
5. **Dependencies are explicit per phase** — parallelization opportunities are visible.

### 9.2 Phase map

```
Phase 0      Repo scaffolding
  │
  ├─ Phase 1   scss/ (lang-registry, scss-index)      ──┐
  ├─ Phase 2   cx/binding-detector                    ──┤  parallel after Phase 1
  └─ Phase 3   cx/call-parser                         ──┘
         │
Phase 4      ts/ (source-file-cache, type-resolver) + cx/call-resolver
         │
Phase 5      indexing/ (analysis-cache, reverse-index null, worker stub)
             + provider-utils (withCxCallAtCursor)
         │
         ├─ Phase 6   definition provider             ──┐
         ├─ Phase 7   hover provider + renderer       ──┤  parallel
         ├─ Phase 8   completion provider             ──┤
         └─ Phase 9   diagnostics provider            ──┘
         │
Phase 9.5    code-actions (Quick Fix)
         │
Phase 10     indexer-worker real + file watcher
         │
Phase 10.5   Tier 3 E2E scaffolding
         │
Phase 11     benchmark harness + CI gates
         │
Phase 11.5   examples/ sandbox (9 scenarios)
         │
Phase 12     README / walkthrough / CHANGELOG / icon
         │
Phase Final  references + reference-lens
             (WorkspaceReverseIndex + tsx scanner)
         │
Phase Release  1.0.0 tag → marketplace publish
```

### 9.3 Phase summaries

**Phase 0 — Repo scaffolding.** Workspaces, tsconfig project refs, rolldown config, empty LSP client/server that responds to `initialize` with empty capabilities. Lint/typecheck/test CI passes. ~400 LOC. Depends on: —.

**Phase 1 — SCSS indexing.** `lang-registry`, `scss-index`, `StyleIndexCache`, Q6 B edge cases, fixtures. ~400 src / ~500 test. Depends on: Phase 0.

**Phase 2 — Cx binding detection.** AST-based `detectCxBindings`, Q7 B cases 1/2/3/5/6/7. ~250 src / ~400 test. Depends on: Phase 1 (lang-registry).

**Phase 3 — Cx call parsing.** AST-based `parseCxCalls`, Q3 B+D patterns, multi-line handling. ~400 src / ~600 test. Depends on: Phase 2 (`CxBinding` type). **Parallel with Phase 2 allowed.**

**Phase 4 — TS + call resolver.** `SourceFileCache`, `TypeResolver` interface + `WorkspaceTypeResolver`, `call-resolver`. ~350 src / ~500 test. Depends on: Phase 1, Phase 3.

**Phase 5 — Indexing infrastructure + provider-utils.** `DocumentAnalysisCache`, `NullReverseIndex`, `IndexerWorker` stub, `text-utils`, `withCxCallAtCursor`, `isInsideCxCall`. **All Phase Final seams land here.** ~450 src / ~600 test. Depends on: Phase 1–4.

**Phase 6 — Definition.** Provider + first Tier 2 harness + lifecycle + definition protocol tests. ~150 src / ~400 test. Depends on: Phase 5.

**Phase 7 — Hover + renderer.** `hover.ts`, `hover-renderer.ts`, markdown templates, multi-candidate rendering. ~250 src / ~400 test. Depends on: Phase 5. **Parallel with 6/8/9.**

**Phase 8 — Completion.** `isInsideCxCall`, classMap → CompletionItem, trigger chars. ~200 src / ~350 test.

**Phase 9 — Diagnostics.** `validateCall`, debounce loop, did-you-mean, partial union mismatch, file-watcher re-validation. ~250 src / ~400 test.

**Phase 9.5 — Code actions.** `handleCodeAction`, Quick Fix from `Diagnostic.data.suggestion`. ~100 src / ~200 test. Depends on: Phase 9.

**Phase 10 — Indexer worker real + file watcher.** `scssFileSupplier`, `onInitialized` hooks, `DidChangeWatchedFilesNotification` registration, full invalidation cascade. ~200 src / ~300 test.

**Phase 10.5 — Tier 3 scaffolding.** `runTest.ts`, mocha runner, `test/e2e/workspace/`, first 15 E2E tests, `e2e.yml`. ~300 src / ~500 test. Depends on: Phase 10.

**Phase 11 — Benchmark harness.** `test/benchmark/*`, `test/fixtures/large-repo/_generate.ts`, CI `bench-fast` job. ~400 src / ~300 test.

**Phase 11.5 — Examples sandbox.** `examples/` with 9 scenarios under a Vite+ root. Manual QA, no automated tests. ~900 LOC total. Depends on: Phase 11.

**Phase 12 — Docs + marketplace assets.** README, walkthrough steps, CHANGELOG, icon, CONTRIBUTING, SECURITY, release script. ~300 LOC docs.

**Phase Final — References + reference-lens.** `WorkspaceReverseIndex`, `tsxFileSupplier`, `references.ts`, `reference-lens.ts`, `config.features.references = true`. Full Tier 1/2/3 coverage added. ~500 src / ~700 test.

**Phase Release — 1.0.0.** Version bump, CHANGELOG finalization, `preview: false`, tag push, marketplace publish, release note. ~50 LOC diff.

### 9.4 Parallelization

| After | Parallel |
|---|---|
| Phase 0 | Phase 1, (then) Phase 2 & 3 together |
| Phase 5 | Phase 6, 7, 8, 9 together |
| Phase 11 | Phase 11.5 and Phase 12 |

Solo development still benefits via smaller PRs with focused review.

### 9.5 Size budget (1.0 totals)

| | src LOC | test LOC |
|---|---:|---:|
| Phases 0–12 | ~5,300 | ~5,450 |
| Phase Final | +500 | +700 |
| Phase Release | +50 | 0 |
| **Total** | **~5,850** | **~6,150** |

Plus fixtures, examples (~900), docs, and marketplace assets.

### 9.6 Phase-scoped risks

| Phase | Risk | Mitigation |
|---|---|---|
| 0 | rolldown-rc15 server bundling | Pre-flight spike; fallback to rc12 |
| 1 | Q6 B edge breadth | TDD per case with postcss AST inspection |
| 3 | Multi-line edge (nested templates, JSX-in-JSX) | AST-native handling absorbs most; add fixtures on discovery |
| 4 | `ts.Program` cost | `warmUp` + benchmark P6 guard |
| 5 | Final seam correctness | Confirmable at Phase Final without provider changes |
| 7 | Markdown UX for multi-candidate | Manual dogfood in Phase 11.5 |
| 9 | Debounce flaky tests | `vi.useFakeTimers` deterministic timers |
| 10 | File watcher platform variance | GitHub ubuntu CI + manual macOS spot-check |
| 10.5 | `@vscode/test-electron` CI stability | xvfb + version pin + retries |
| 11 | Benchmark determinism | Rolling window p95, generous targets |
| Final | Index consistency on file change paths | Tier 2 + Tier 3 systematic cases |

### 9.7 Ordering rationale

Data layer first so providers never mock core; presentation layer second so mocks are minimal; indexer + watcher after providers so invalidation has something to protect; E2E after functional completion to avoid stack-wide flakes; benchmarks after features stabilize; examples + docs last so they describe the actual shipped behavior; Phase Final last so it can be rolled back (toggling `features.references = false`) if quality doesn't meet the bar.

---

## 10. Risks, Open Questions & Future Work

### 10.1 Technical risks

**R1. rolldown-rc15 server bundle unverified.** High impact, low probability. **Mitigation:** a pre-Phase-0 spike (5 minutes) tries a minimal server bundle; fall back to rc12 if it fails. CI `pnpm build` catches regressions.

**R2. TypeScript 6 Compiler API breaking changes.** Medium impact, low probability. **Mitigation:** read TS 6 release notes before Phase 4; `WorkspaceTypeResolver` isolates API differences behind its own interface; `typeToString()`-based fallback available.

**R3. `@vscode/test-electron` CI flakiness.** Medium impact, medium probability. **Mitigation:** Tier 3 excluded from PR gate; pinned VS Code version; mocha retries ×2; flaky tests get quarantined.

**R4. `ts.Program` cold start UX.** Low-medium impact, high probability. **Mitigation:** `warmUp`; nightly P6 guards; logger message on first cold call; UX hint "Resolving type..." for variable-kind hover during warmup.

**R5. `postcss-scss` parse edge failures.** Medium impact, low probability. **Mitigation:** file-boundary try/catch; vanilla-postcss fallback; failures listed in `showStats`.

### 10.2 Design risks

**R6. `classnames/bind` popularity decline.** Strategic, not technical. **Mitigation:** architecture doesn't block FC1 (direct `styles.x`) or FC2 (clsx); README positioning.

**R7. `ReverseIndex` memory scale.** Low impact, low probability. **Mitigation:** Phase Final "5000 tsx file" nightly fixture; sharding path reserved for 1.1+.

**R8. Vite+ alpha lock-in in `examples/`.** Low impact, medium probability. **Mitigation:** each scenario has a `pnpm vite` fallback; Vite+ is the convenience layer only.

### 10.3 Open questions

**OQ1. Multi-root workspace support?** → **Single root only in 1.0.** README documents. 1.1+ revisit. Decided at Phase 0.

**OQ2. `.ts`/`.js` in document selector?** → **Include all four.** Cost near-zero, alignment with "completeness" framing. Decided at Phase 6.

**OQ3. `trace.server: verbose` log format?** → **Plain text `[category] message`**; LSP standard trace is handled by vscode-languageclient. Decided at Phase 5.

**OQ4. `CancellationToken` propagation depth?** → **Entry + exit checks only** in 1.0. Deeper propagation deferred. Decided at Phase 7.

### 10.4 Future work (priority order)

1. **FW1. LESS support** — one lang-registry entry + `postcss-less`. High priority if demand appears.
2. **FW2. `styles.className` direct access (FC1)** — new provider path; architecture already supports it. High priority.
3. **FW3. `clsx` support (FC2)** — binding detector + call parser branches. Medium priority.
4. **FW4. Rename refactoring** — cross-file atomic edits. Medium priority, large effort.
5. **FW5. `composes:` chain tracing** — dependency graph. Low priority.
6. **FW6. Workspace-wide diagnostics real implementation.** Low priority.
7. **FW7. Worker threads for very large SCSS files.** Low priority.
8. **FW8. Web Extension mode (non-file scheme).** Low priority.
9. **FW9. Telemetry (opt-in).** Very low priority.

### 10.5 Anti-goals

- Obsessive bundle size minimization
- "Magic" auto-detection beyond zero-config baseline
- Competition with stylelint / CSS IntelliSense / formatters
- Config option proliferation
- Exposing internal API to other extensions

### 10.6 Risk matrix

| # | Risk | Impact | Prob | Mitigation | Priority |
|---|---|---|---|---|---|
| R1 | rolldown bundling | High | Low | Downgrade | **High** |
| R2 | TS 6 API | Medium | Low | Interface isolation | Medium |
| R3 | E2E CI flaky | Medium | Medium | Retry + quarantine | **Medium-High** |
| R4 | TS cold start | Low-Med | High | warmUp | Medium |
| R5 | postcss-scss fails | Medium | Low | File-scope + fallback | Medium |
| R6 | ecosystem shift | Strategic | Medium | Non-blocking arch | Low |
| R7 | reverse index memory | Low | Low | Sharding path | Low |
| R8 | Vite+ lock-in | Low | Medium | Fallback script | Low |

### 10.7 Known limitations (README)

1. Only `classnames/bind` `cx()` patterns.
2. Only `cx()`-gated access — direct `styles.className` is deferred (FC1).
3. Only local CSS Modules files — `composes:` chains are not chased.
4. Single workspace folder only.
5. Only `file:` scheme.
6. Only literal `bind(styles)` — dynamic merges are not recognized.
7. No rename refactoring.

---

## Decision Log

This section records every user decision during brainstorming, for traceability from test names (`(Q# X)`) back to the source decision.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| Q1 | Project positioning | Clean rebuild aiming for 1.0 production quality, using previous structure as reference | User goal: "완벽한 제품" |
| Q2 | Style language scope | **B** — SCSS + CSS, architecture extensible to LESS | postcss-scss handles CSS; LESS needs a parser switch (one file later) |
| Q3 | Cx call parser | **B + D** — TypeScript Compiler API AST parser + extended patterns (spread/array/multi-arg) | Multi-line and comment/string edge cases solved for free |
| Q4 | Diagnostics scope | **A** — open document only (config escape hatch to `workspace` schema-only) | Ecosystem standard; workspace-wide defer to 1.1+ |
| Q5 | Find References | **D** — implemented via workspace indexer + incremental file watcher, UX via CodeLens; implementation order last; earlier phases architected to accept it | Completes "완벽한 제품" vision without blocking early phases |
| Q6 | SCSS index edge cases | **B** — base cases + CSS variable declarations in hover + cascade last-wins | `composes:` deferred to 1.1+ |
| Q7 | Cx binding edge cases | **B** — standard + free names + function-scoped bindings | AST scope walker makes function scope cheap |
| Q8 | Hover/completion UX | **B** — rich markdown, multi-candidate summary, `,` trigger, alpha sort | Completeness framing; previous implementation already had the raw data |
| Q9 | Infra/repo/release | Defaults accepted (`yongsk0066.css-module-explainer`, pnpm workspace, dev path, Vite+ for examples only, 3-tier tests) | No changes needed |
| — | core/ layout | Domain-grouped (scss/ cx/ ts/ indexing/ util/), 5 subdirs | Flat 10 files was harder to reason about |
| — | Test harness | 3-tier model (Unit / Protocol / E2E) inspired by React DevTools; Vite+ scoped to `examples/` only (alpha risk) | Research of React DevTools test structure |
| — | Code actions | Quick Fix from `Diagnostic.data.suggestion` included in 1.0 (new Phase 9.5) | Trivial given existing suggestion data; "완벽한 제품" fit |
| — | Partial union mismatch | Report when any union member is missing (new config: `reportPartialUnionMismatch = true`) | More specific diagnostics |

---

## Glossary

- **cx** — the function returned by `classnames.bind(styles)`. Typically named `cx` but any name is supported.
- **binding** — a (cxVarName, stylesVarName, scssPath) tuple identifying one `cx` variable instance in a file.
- **CxCallInfo** — the parsed representation of one `cx(...)` argument at a specific source location.
- **SelectorInfo** — the parsed representation of one class selector inside a `.module.scss|css` file.
- **ScssClassMap** — `ReadonlyMap<string, SelectorInfo>` per style file.
- **ReverseIndex** — the `scssPath → (className → CallSite[])` map used by Phase Final.
- **In-flight tier** — TS source parsing path for live (unsaved) editor text.
- **Workspace tier** — TS source path using `ts.Program` for type checker queries.
- **Phase Final** — the last implementation phase adding Find References + CodeLens.
- **Style language** — `scss` or `css` in 1.0; a future slot for `less`.
