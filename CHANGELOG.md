# Changelog

All notable changes to this project will be documented in this
file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] — 2026-04-11

### Added

- **Missing CSS Module diagnostic** — `import styles from './typo.module.scss'` now emits a `missing-module` warning when the target file does not exist on disk. Fires for any file with a CSS Module import, including pure `styles.x` access without `classnames/bind`. Configurable via `cssModuleExplainer.diagnostics.missingModule` (default `true`).
- **Path alias compat — `cssModules.pathAlias`** — the clinyong/vscode-cssmodules `cssModules.pathAlias` config is read as-is, so `import styles from '@styles/button.module.scss'` resolves when the workspace has `"cssModules.pathAlias": { "@styles": "src/styles" }` in its settings. Zero-config migration for clinyong users. **One intentional divergence**: we use longest-prefix matching instead of clinyong's insertion-order first-match, so `{ "@": "src", "@styles": "src/styles" }` correctly routes `@styles/button` to `src/styles/button` regardless of config key order. `${workspaceFolder}` substitution is supported. Wildcards and tsconfig.json `compilerOptions.paths` auto-detection are not yet supported — tracked for a future release.
- **`classnameTransform` setting** — expose SCSS classes under five modes matching css-loader's `localsConvention`: `asIs` (default, unchanged behavior), `camelCase` (original + camelCase alias), `camelCaseOnly` (camelCase only), `dashes` (original + dashes-to-camel alias), `dashesOnly` (dashes-to-camel only). With `camelCase` active, both `styles['btn-primary']` and `styles.btnPrimary` resolve against a single `.btn-primary` selector. Alias entries participate in BEM-safe rename — renaming `btnPrimary` rewrites the original `.btn-primary` token in SCSS and every call site in TSX, with each site getting the form that matches how it accesses the class. `camelCaseOnly` and `dashesOnly` reject alias rename because the reverse transform from camelCase back to the original SCSS separator is lossy; use `camelCase` / `dashes` for editor-driven rename workflows. Configurable via `cssModuleExplainer.scss.classnameTransform` (default `"asIs"`).

## [1.5.1] — 2026-04-11

### Added

- **`&`-nested BEM rename** — `.button { &--primary {} }` and `.button { &__icon {} }` can now be renamed directly from the SCSS selector. Only the `--primary` / `__icon` suffix slice is rewritten in the SCSS file; every `cx('button--primary')` reference in the workspace updates in lockstep. Compound nested forms (`&.active`), pseudo (`&:hover`), grouped parents, non-bare parents (`.card:hover { &--x }`), grouped-nested children (`&--a, &--b`), and multi-`&` tokens remain safely rejected.

### Fixed

- **Latent corruption in `&`-nested range fallback** — previously, `SelectorInfo.range` for `&`-nested entries was a synthesized column that could span past the nested token into whitespace. Earlier releases defensively rejected rename on those entries; 1.5.1 computes the correct raw-token range using postcss absolute source offsets, eliminating the fallback path entirely.

## [1.5.0] — 2026-04-11

### Fixed

- **Rename no longer corrupts template literals** — `cx(\`btn-${weight}\`)` style calls were silently rewritten when a referenced class was renamed, destroying the template source. The reverse index now distinguishes direct and synthesized entries; rename filters out synthesized ones while Find References keeps them. Both the TSX-side and SCSS-side prepareRename now reject classes with template/variable references uniformly.
- **Incremental file updates no longer dropped after initial indexing** — `IndexerWorker.pushFile()` was inert once the initial workspace walk finished, so file-watcher events silently fell on the floor. A new `PushSignal` async-iterable replaces the old signal so `drain()` parks on incoming push events via `for await` without exiting.
- **SCSS diagnostics now reflect unsaved edits** — `classMapForPath` consults the in-memory `TextDocuments` buffer before falling back to disk, so unused-selector and unknown-class diagnostics respond immediately to unsaved SCSS changes.
- **`&`-nested SCSS rename rejected defensively** — the parser now flips `SelectorInfo.isNested = true` when the raw source contained `&`, and `rename` returns `null` for those entries instead of rewriting the synthesized fallback range.
- **Reverse-index staleness on SCSS file changes** — when a SCSS module gained or lost a class, cached TSX analysis entries were not invalidated, leaving template/variable expansions stale until the user touched the TSX buffer. `onDidChangeWatchedFiles` now invalidates every TSX entry that referenced the changed SCSS path before rescheduling diagnostics.
- **Invalid user config values no longer leak through untyped** — the settings loader validates inputs via explicit type guards and falls back to defaults for wrong types, unknown severities, `NaN`, `Infinity`, etc.

### Changed

- **Unified `ClassRef` domain model** — legacy `CxCallInfo` and `StylePropertyRef` types collapsed into a single `ClassRef` discriminated union (`static | template | variable`, tagged with `origin: "cxCall" | "styleAccess"`). Every provider now dispatches through a single `withClassRefAtCursor` front stage; the parallel `withCxCallAtCursor` / `withStyleRefAtCursor` dispatch pattern is gone.
- **Error boundary at every LSP handler** — new `wrapHandler(name, impl, fallback)` helper (Stylable-inspired) wraps each provider export with a try/catch + `logError` + safe default. The nine hand-rolled try/catch blocks in individual providers are deleted.
- **Single-source DI** — `HandlerContext.getBundle()` and the `CompositionBundle` interface deleted; the four style-index / indexer capabilities (`invalidateStyle`, `pushStyleFile`, `indexerReady`, `stopIndexer`) are now flat fields on `ProviderDeps`.
- **Completion pipeline collapsed** — the two parallel pipelines added in v1.4.0 for `classnames/bind` vs `clsx / classnames` are unified into a single `findCompletionContext` helper that iterates once over bindings and style imports. `isInsideCxCall` renamed to `isInsideCall`. `detectClassUtilImports` moved to the binding-detector layer and exposed via `AnalysisEntry.classUtilNames`.
- **Binding detector single-walk** — `collectImports` now makes exactly one pass over `sourceFile.statements` instead of two.
- **Dead code removed** — `FileTask.kind`, `IndexerWorkerDeps.onTsxFile`, `buildStyleImportRegex`, and every `@deprecated` legacy type marker deleted.
- **Type assertions minimized** — zero `as` casts in the server tree outside the documented `getRuntimeSyntax` helper (the single `unknown → postcss.Syntax` narrowing) and the `as const` / `as readonly` widenings. `parseSettings` uses type guards. `scss-parser.ts` relies on postcss's discriminated union directly. `CreateServerOptions` is a discriminated union of `"auto" | "streams"` transports. `ShowReferencesArgs` is a shared tuple type; the client middleware narrows via a single `isShowReferencesArgs` guard instead of three `as` casts.
- **Incremental release tooling** — new `scripts/release.sh` syncs `SERVER_VERSION` with `package.json` before the build.

## [1.4.0] — 2026-04-11

### Added

- **clsx / classnames support** — Autocomplete, hover, and go-to-definition for `clsx(styles.btn)` and `classNames(styles.btn)` patterns, alongside the existing `classnames/bind` support.
- **Unused selector detection** — CSS class selectors in `.module.scss` files with zero references are flagged with `DiagnosticTag.Unnecessary` (faded text). Template and variable call sites suppress false positives; `composes` references are honored.
- **Rename Symbol** — Bidirectional rename between `.module.scss` selectors and `cx('className')` / `styles.className` references across the workspace. `&`-nested SCSS selectors are rejected in this release.
- **Example scenario 10-clsx** — New sandbox scenario demonstrating `clsx(styles.btn, isActive && styles.active)`.

### Fixed

- **styles.x now works in files without classnames/bind** — Extracted style-import scanning from the cx binding detector so `styles.className` hover and go-to-definition work in any file with a `.module.*` import, regardless of whether `classnames/bind` is used.

### Changed

- **CallSite type narrowed** — Internal `CallSite.binding: CxBinding` and `CxCallBase.binding: CxBinding` replaced with `scssModulePath: string`. Eliminates synthetic binding objects and narrows the dependency graph.
- **Diagnostics scheduler extracted** — Debounce and index-readiness gating moved out of `handler-registration.ts` into a dedicated module.
- **Test fixtures consolidated** — `test/_fixtures/test-helpers.ts` exposes shared `makeBaseDeps`, `info`, `infoAtLine`, and `siteAt` helpers. All provider test files migrated.

### Configuration

- Added `cssModuleExplainer.diagnostics.unusedSelector` (default: `true`).
- Added `cssModuleExplainer.features.rename` (default: `true`).

## [1.1.0] — 2026-04-10

### Changed

- **LRU cache refactor** — `StyleIndexCache`, `SourceFileCache`,
  and `DocumentAnalysisCache` now delegate eviction logic to a
  shared `LruMap<K, V>` utility, removing three identical
  `private put()` methods.
- **hover.ts cleanup** — duplicated synthetic binding object
  extracted to a local variable; `kind: "static" as const`
  added for type safety.
- **CI pipeline** — `dist/` build artifact is uploaded in the
  `check` job and downloaded in `package`, eliminating a
  redundant `pnpm build`. Added `concurrency` (cancel
  in-progress), top-level `permissions: { contents: read }`,
  and `if-no-files-found: error` on both artifact uploads.

### Fixed

- Removed internal planning references (Q6, Q7, Plan, Phase,
  Agent) from test describe blocks, comments, and
  documentation.

## [1.0.0] — 2026-04-10

First marketplace-ready release. Everything below was built
from scratch in a single sprint; there is no prior
production history to migrate from.

### Added

**Providers** (all dispatched through a single front-stage
`withCxCallAtCursor` + a per-(uri, version) analysis cache so
hot paths stay under 1 ms):

- **Definition provider** (`textDocument/definition`) —
  `LocationLink[]` with origin, target, and target selection
  ranges so VS Code's peek view highlights correctly.
- **Hover provider** (`textDocument/hover`) — markdown card
  with workspace-relative source location, formatted SCSS
  rule, and a multi-match layout capped at 10 candidates.
- **Completion provider** (`textDocument/completion`) —
  triggered on `'`, `"`, `` ` ``, `,`; emits one
  `CompletionItem` per class in the bound classMap with a
  live markdown preview in the documentation field.
- **Diagnostics provider** (`textDocument/publishDiagnostics`)
  — 200 ms debounced push model with per-call error
  isolation. Unknown static classes emit warnings with a
  "did you mean?" hint (Levenshtein ≤ 3). Template prefix
  mismatches and partial union mismatches are reported with
  distinct messages.
- **Code actions provider** (`textDocument/codeAction`) —
  `quickfix` actions consuming the diagnostic's
  `data.suggestion` payload. One-click rename.
- **References provider** (`textDocument/references`) — runs
  on class selectors inside `.module.{scss,css}` files,
  returns every `cx()` call site workspace-wide.
- **Reference code-lens** (`textDocument/codeLens`) — inline
  "N references" counter above every class selector, linked
  to VS Code's built-in references panel.

**Parsing and indexing**:

- **SCSS index** — `parseStyleModule` + `StyleIndexCache`
  cover edge cases: `:global`/`:local` selectors, `&`
  ampersand nesting, group selectors, cascade last-wins
  duplicate handling, `@keyframes` / `@font-face` exclusion,
  `@media`/`@at-root` unwrapping.
- **`cx` binding detector** — AST-based two-pass scanner
  over the TypeScript `ts.SourceFile`; recognizes free
  identifier names, aliased imports
  (`import cn from 'classnames/bind'`), multi-binding per
  file, function-scoped bindings with tracked scope ranges.
- **`cx` call parser** — seven-branch AST dispatch (string
  literal, object literal, `&&` / `?:` conditionals,
  template literal, identifier, array literal, spread).
  Multi-line is free (AST is line-agnostic).
- **Call resolver** — pure dispatch by call kind: static →
  `classMap.get`; template → prefix filter; variable →
  `TypeResolver.resolve` + union member filter.
- **TypeScript 2-tier strategy** — in-flight
  `SourceFileCache` for live editor text (ms-scale parses)
  plus a workspace `TypeResolver` that lazily builds
  `ts.Program` instances keyed on the tsconfig root for
  string-literal union resolution.
- **Document analysis cache** — single-parse hub keyed on
  `(uri, TextDocument.version)` with a content-hash
  fallback for the "version bumped but content is
  identical" edge case. `onAnalyze` hook fires the reverse
  index write exactly once per (uri, version) — never on
  provider hot paths.
- **Workspace reverse index** — `(scssPath, className) →
  CallSite[]` forward map plus a `uri → keys` back
  pointer for O(|callSites|) `forget(uri)` on document
  close. Static call kinds only; template/variable are
  explicitly skipped for this release.
- **Indexer worker** — cancellable background walker
  built on `fast-glob` streams and a `for-await` +
  sync-drain pattern. Yields to the event loop via
  `node:timers/promises.setImmediate` between files so
  LSP requests always preempt.
- **File watcher** — dynamic `DidChangeWatchedFiles`
  registration gated on client capability. Invalidates
  `StyleIndexCache` + re-queues the changed file through
  the indexer + reschedules diagnostics for every open
  document.

**Composition root**:

- Single `createServer({ reader, writer, overrides })`
  factory. Production entrypoint passes `process.stdin`
  / `process.stdout`; Tier 2 tests pass paired
  `PassThrough` streams wrapped in
  `StreamMessageReader`/`Writer` to bypass
  vscode-languageserver's auto-`process.exit` handlers.

**Tooling**:

- **pnpm** workspace (`shared`/`server`/`client` +
  private `examples/`).
- **TypeScript 6.0.2** with `NodeNext` module resolution
  and strict mode across the board.
- **Rolldown 1.0.0-rc.15** bundler producing CJS output
  for the VS Code extension host.
- **Vitest 4.1** with two test tiers (`unit/`,
  `protocol/`) and a `bench/` perf suite.
- **oxlint 1.59** + **oxfmt 0.44** replacing ESLint and
  Prettier. Zero `eslint-disable` comments in the source
  tree.

**Quality gates**:

- 253 Tier 1 + Tier 2 tests, 0 lint warnings, build clean.
- Cold hover ~0.029 ms, cold definition ~0.028 ms, cold
  completion ~0.013 ms.

### Known limitations

- Template-literal and variable-kind call sites are NOT
  in the reverse index for 1.0. Find References works on
  static calls only; a follow-up will resolve template
  prefixes and union members to individual class names
  before recording.
- Diagnostics do NOT emit a warning for a missing SCSS
  file (e.g. after a delete). They silently skip the
  document until the file reappears.
- `isInsideCxCall` (used by completion gating) is a naive
  paren-depth walker — it does not understand string or
  comment context. Edge cases like `cx(')')` return
  slightly wrong answers.
- Tier 3 E2E (real VS Code via `@vscode/test-electron`)
  is deferred; the release relies on manual dogfooding
  via `examples/`.

## [0.0.1] — 2026-04-09

Repository scaffolding. Not published.
