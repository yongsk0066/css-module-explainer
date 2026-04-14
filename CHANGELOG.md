# Changelog

## [3.2.0] — 2026-04-15

### Added

- **Architecture hardening runtime split** — workspace execution is now explicitly divided into settings, analysis, and style runtimes, with a transport-agnostic runtime sink for logging, diagnostics clearing, and CodeLens refresh requests.
- **Incremental reference storage** — selector references, module usages, and dependency reverse lookups now update contribution-by-contribution instead of rebuilding whole derived maps on every record or forget.
- **Package-ready entry boundaries** — core query, rewrite, semantic, and runtime entrypoints are now explicit, with architecture tests enforcing dependency direction for future extraction into standalone engine packages.

### Changed

- **Runtime invalidation is now explicit** — watched-file classification, dependency snapshots, and invalidation planning are separated into dedicated runtime contracts instead of being assembled ad hoc inside handler wiring.
- **Semantic storage is now collector/store based** — reference contribution collection, reference storage, and dependency storage now have distinct responsibilities, which makes the runtime easier to reason about and cheaper to update incrementally.
- **Style rewrite policy is derived, not embedded** — rename and rewrite planning now consume a style rewrite policy summary instead of directly interpreting raw nested/BEM policy fields.
- **Provider boundaries are stricter** — providers read query/rewrite façades instead of deep semantic, binder, or runtime internals, and architecture invariant tests lock that boundary in place.
- **Examples QA matrix expanded again** — the sandbox now includes dedicated diagnostics-recovery, bracket-access, and `.module.less` coverage so the remaining runtime surfaces can be checked without ad hoc setup.

### Fixed

- **Local packaging from development checkouts** — `.worktrees/` and `.pnpm-store/` are now excluded from the VSIX, preventing `vsce package` failures and accidental bundling of local development artifacts.

## [3.1.1] — 2026-04-14

### Added

- **Multi-root workspace routing** — workspace folders now carry resource-scoped settings and path alias resolution independently, so mixed repos can use different CSS Modules conventions without restarting the server.
- **`composes` dependency graph** — cross-file and same-file `composes` edges now participate in selector usage, Find References, hover, definition, rename safety, and CodeLens.
- **Style-side inspect surface** — selector hover now reports usage and dependency context, `composes` tokens support hover/definition/references, and CodeLens titles distinguish composed and dynamic references.
- **Source and style dependency invalidation** — watched file changes now recompute only affected open documents for source imports, style dependencies, and settings-driven reanalysis.

### Changed

- **Stable promotion version** — the `3.1.0` version number was already consumed by the Marketplace pre-release channel, so the first stable cut of this feature line ships as `3.1.1`.
- **Compatibility path alias guidance** — the native `cssModuleExplainer.pathAlias` key is now the preferred setting; falling back to `cssModules.pathAlias` logs a deprecation notice per workspace root.
- **Examples sandbox expanded** — the manual QA matrix now includes dedicated `composes` coverage alongside the multi-root, shadowing, non-finite dynamic, and nested style fact scenarios.

### Fixed

- **Nested and composed style diagnostics** — unresolved `composes` modules/selectors now surface SCSS diagnostics, and missing composed modules offer the same create-file quick fix flow as missing source-side module imports.

## 3.0.0

### Major Changes

- Replace the old heuristic runtime with the 3.0 semantic pipeline: document facts, scoped binding, abstract class-value analysis, provider-facing read models, and generic rewrite planning now form the production path.
- Make source-side binding scope-aware across `cx`, `styles`, imports, locals, and shadowing instead of relying on line-range and document-order heuristics.
- Unify dynamic class reasoning under a shared abstract-value domain so flow, unions, template prefixes, and non-finite cases follow one contract.
- Move provider behavior onto explicit read models and rewrite policies, reducing provider-local semantic glue and removing the old semantic-graph-first runtime path.
- Expand the examples sandbox into a 3.0 manual QA matrix covering nested style facts, shadowing, and non-finite dynamic resolution.

### Patch Changes

- Fix nested `&.class` compound selector registration so classes introduced inside nested compounds resolve to the selector that actually introduced them without overwriting parent facts.

## 2.1.0

### Minor Changes

- [#7](https://github.com/yongsk0066/css-module-explainer/pull/7) [`0d9462a`](https://github.com/yongsk0066/css-module-explainer/commit/0d9462a76337d0c9a6fa5234b4b06f3ef84657c8) Thanks [@yongsk0066](https://github.com/yongsk0066)! - Add support for resolving CSS Module imports through `tsconfig.json` and `jsconfig.json`
  `compilerOptions.paths`, including wildcard aliases.

  This release also refreshes the examples sandbox with a dedicated tsconfig-path scenario
  so alias-import regressions are exercised outside the test harness.

## 2.0.1

### Patch Changes

- [#2](https://github.com/yongsk0066/css-module-explainer/pull/2) [`d8ee9bd`](https://github.com/yongsk0066/css-module-explainer/commit/d8ee9bda19f0107a8f4aebe4139a6f0eba182452) Thanks [@yongsk0066](https://github.com/yongsk0066)! - Refresh SCSS reference count code lenses when semantic reference data changes so reference counts stay in sync after source analysis.

All notable changes to this project will be documented in this
file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-04-13

### Added

- **Semantic runtime across the feature set** — source and style analysis now run through HIR documents, a semantic graph, shared queries, and flow-aware resolution. Hover, definition, references, rename, diagnostics, code actions, and unused-selector checks all resolve through the same runtime path.
- **Missing-selector creation quick fix** — unresolved class diagnostics can now add the missing selector directly to the target CSS Module.
- **Missing-module file quick fix** — unresolved CSS Module import diagnostics can now create the missing module file from the code action menu.
- **Dynamic hover explanations** — hover now explains when a class reference was resolved through local flow, type-union fallback, or template-prefix expansion, including candidate lists for non-exact matches.
- **Explicit rename block reasons** — rename now returns concrete failure reasons for dynamic expressions, alias-only views, unsafe nested selectors, and non-direct reference cases.

### Changed

- **Legacy compatibility layers removed from runtime** — the extension no longer routes live behavior through legacy class-ref or class-map compatibility shells. The runtime is now semantic-first end to end.
- **Examples sandbox aligned with the workspace toolchain** — `examples/` now installs through the root workspace, uses a current React Vite plugin path, and ships with editor settings that match the baseline QA mode.
- **README rewritten** — the project overview, configuration, architecture, and development sections now reflect the current runtime and release shape.
- **Release workflows now sync server version before build** — CI and publish workflows run `scripts/release.sh` before building so `serverInfo.version` matches the packaged extension version.

## [1.8.0] — 2026-04-12

### Added

- **Bracket-access style references** — `styles['foo-bar']` element-access expressions are now recognized alongside `styles.fooBar` dot-access. Hover, definition, diagnostics, references, and rename all work through bracket syntax.
- **Dotted property chain resolution** — `cx(sizes.large)` where `sizes` is a `const` object with string-literal properties now resolves to the property's value. Works for local objects, named imports, default imports, namespace imports, and renamed imports.
- **Import-aware type resolution** — the TypeResolver now follows import bindings (`import { sizes } from './theme'`) through `checker.getAliasedSymbol`, enabling cross-file variable/template expansion in the reverse index.

### Fixed

- **Source-file save staleness** — saving a `.ts`/`.tsx`/`.js`/`.jsx` file now invalidates the TypeResolver's cached `ts.Program` and drops stale analysis-cache entries for all open source documents, so reverse-index expansions rebuild with fresh type data. Previously, type changes were invisible until server restart.
- **Reverse-index cascade on source change** — after a source-file watcher event, the analysis cache for open TSX/TS documents is invalidated so `onAnalyze` re-fires and the reverse index rebuilds. Without this, Find References, CodeLens, unused-selector diagnostics, and rename readiness stayed frozen against old type data.
- **Import shadowing regression** — `findIdentifierSymbol` now uses a local-first / import-fallback 2-pass strategy. A local parameter `sizes` correctly shadows an import with the same name, matching TypeScript's scoping rules in the common case.

### Changed

- **Watcher glob expanded** — file watchers now cover `.d.ts`, `tsconfig*.json`, and `jsconfig*.json` in addition to source files, so declaration and config changes also trigger TypeResolver invalidation.
- **SCSS parser split** — `scss-parser.ts` (was 436 lines) split into `scss-parser.ts` (pipeline) + `scss-selector-utils.ts` (pure utilities).
- **BEM suffix extraction** — `classifyBemSuffixSite` 6-parameter data clump collapsed into `BemParentContext` interface; BEM logic extracted to `core/scss/bem-suffix.ts`.
- **Rename module split** — `rename.ts` (372 lines) split into `rename/index.ts` + `rename/build-edit.ts`.
- **AliasResolverHolder extraction** — shared-closure pattern extracted from inline composition-root code to a standalone class in `core/cx/alias-resolver.ts`.
- **Lint cleanup** — all 9 lint warnings resolved (0 warnings, 0 errors).

## [1.7.0] — 2026-04-12

### Fixed

- **Find References + CodeLens under `classnameTransform`** — under `camelCase` or `camelCaseOnly` modes, Find References from a SCSS selector returned empty results and CodeLens showed `0 references` or rendered duplicate lenses. The reverse-index query now routes through the canonical SCSS selector name regardless of which alias view the cursor sits on, and CodeLens deduplicates entries by canonical name so each logical class renders exactly one lens.
- **SCSS diagnostics refresh on `classnameTransform` change** — switching the transform mode in settings left open `.module.scss` files with stale unused-selector diagnostics until the user edited the file. The reload handler now routes each open document to the right scheduler method by language, so SCSS unused-selector checks recompute immediately on a mode change.
- **Reverse-index memory leak on document close** — closing a TSX file did not drop its contribution from the workspace reverse index. On a long session the index grew unbounded, and a SCSS unused-selector check run after close still treated the closed file's references as live. The `onDidClose` listener now calls `reverseIndex.forget(uri)`.
- **Unicode class-name identifiers** — selectors like `.한글`, `.日本語`, or `.español-btn` were silently dropped from the class map because the extraction regex was ASCII-only. Widened to Unicode property classes (`\p{L}`, `\p{N}`, `\p{M}`) so every script CSS Modules accepts survives, including NFD-decomposed combining marks.

### Changed

- **`canonicalNameOf` helper** — the `info.originalName ?? info.name` pattern (5 call sites across references, reference-lens, scss-diagnostics, rename, and reverse-index) is extracted to a single `canonicalNameOf(info)` function in `classname-transform.ts`.
- **Exhaustive ClassRef dispatch** — three switch statements over the `ClassRef` discriminated union (`hover-renderer`, `diagnostics`, `reverse-index`) now carry `never` sentinel defaults so a future union extension fails at compile time instead of silently falling through.
- **Configuration table rewritten** — the README settings section is rebuilt from `package.json contributes.configuration` as the source of truth. Six fictional settings removed; ten real settings documented.
- **CHANGELOG backfill** — 1.2.0 and 1.3.0 entries added from git history; 1.1.0 jargon rewritten.
- **Benchmark wired through real parsers** — `providers.bench.ts` now measures the actual `scanCxImports` + `parseClassRefs` AST walkers instead of hardcoded stubs, and delegates ProviderDeps construction to `makeBaseDeps` so the shape stays current.

### Removed

- **Dead `ProviderDeps.aliasResolver` field** — no provider consumed it. The alias resolver the analysis cache depends on is wired separately through `DocumentAnalysisCacheDeps`.
- **Section-divider comments** — `// ───` horizontal-rule comments removed from 7 files.

## [1.6.0] — 2026-04-11

### Added

- **Missing CSS Module diagnostic** — `import styles from './typo.module.scss'` now emits a `missing-module` warning when the target file does not exist on disk. Fires for any file with a CSS Module import, including pure `styles.x` access without `classnames/bind`. Configurable via `cssModuleExplainer.diagnostics.missingModule` (default `true`).
- **Path alias compat — `cssModules.pathAlias`** — the `cssModules.pathAlias` config is read as-is, so `import styles from '@styles/button.module.scss'` resolves when the workspace has `"cssModules.pathAlias": { "@styles": "src/styles" }` in its settings. Existing workspace settings continue to work without migration. Alias matching uses longest-prefix order, so `{ "@": "src", "@styles": "src/styles" }` correctly routes `@styles/button` to `src/styles/button` regardless of config key order. `${workspaceFolder}` substitution is supported. Wildcards and tsconfig.json `compilerOptions.paths` auto-detection are not yet supported — tracked for a future release.
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
- **Error boundary at every LSP handler** — new `wrapHandler(name, impl, fallback)` helper wraps each provider export with a try/catch + `logError` + safe default. The nine hand-rolled try/catch blocks in individual providers are deleted.
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

## [1.3.0] — 2026-04-10

### Fixed

- **Multi-line `cx()` calls now register** — class literals in
  `cx()` calls spanning more than one line are captured by the
  AST walker, so every line in a multi-line argument list
  participates in hover, completion, references, and diagnostics.
- **Reference CodeLens on class selectors** — the "N references"
  CodeLens above every `.module.scss` class selector is now
  wired through `textDocument/codeLens` and opens VS Code's
  built-in references panel on click.
- **Empty reference lenses suppressed** — classes with zero
  references no longer emit a `"0 references"` lens; the lens
  is omitted entirely so the editor gutter stays clean.

## [1.2.0] — 2026-04-10

### Added

- **LESS support** — `.module.less` files parse through
  postcss-less; every provider that works on `.module.scss`
  works on `.module.less`.
- **Namespace imports** — `import * as styles from './x.module.scss'`
  is recognised alongside the default-import form.
- **String-aware completion gating** — completion no longer
  triggers inside string literals that happen to be passed to a
  `cx()` call, avoiding spurious popups inside quoted content.
- **Direct `styles.x` access** — hover, definition, and
  completion work on `styles.className` property access in any
  file, independent of whether `classnames/bind` is imported.
- **Template reverse-index expansion** — template-literal and
  variable-kind call sites (e.g. `` cx(`btn-${weight}`) ``) are
  expanded against the class map at index time, so Find
  References on a selector surfaces every dynamically-referenced
  site.
- **`cx(props.variant)` property access** — bare property-
  access identifiers passed to `cx()` resolve against the same
  TypeScript string-literal union machinery used for plain
  variables.
- **`composes:` declarations** — SCSS classes that compose from
  a sibling class (same-file or `from '.otherFile.module.scss'`)
  are treated as used by the unused-selector check, preventing
  false-positive hints.
- **Grouped selector support** — `a, b {}` rules now contribute
  both `a` and `b` to the class map with their own source
  ranges, so hover and go-to-definition pick the right selector.
- **Settings schema** — first `contributes.configuration` entry
  in `package.json` exposes user-facing settings through the VS
  Code settings UI. Per-feature toggles and diagnostic
  configuration land in this release.

### Fixed

- **Levenshtein suggestion bounded** — the "did you mean?" hint
  in diagnostics uses a bounded-edit Levenshtein with early
  termination so very long class names do not slow the check.

### Changed

- **Module resolution switched to bundler** — server and
  shared packages compile under `"moduleResolution": "Bundler"`,
  removing the `.js` extension suffixes from internal imports.
- **Node engine bumped to 24** — `engines.node` set to `>=24`;
  `engines.vscode` pinned to `^1.115.0`.
- **Shared LruMap utility** — `StyleIndexCache`,
  `SourceFileCache`, and `DocumentAnalysisCache` delegate
  eviction to a shared `LruMap<K, V>` helper, removing three
  identical inline implementations.
- **Shared `FakeTypeResolver` fixture** — fourteen inline copies
  of a fake `TypeResolver` across provider tests collapsed into
  a single `test/_fixtures/fake-type-resolver.ts`.
- **SCSS index module split** — `scss-index.ts` separated from
  the parser file so `StyleIndexCache` and `parseStyleModule`
  live in distinct modules.
- **Composition root split** — the startup factory split out
  settings, scheduler, indexer, and type-resolver factories so
  the root stays a thin DI wire-up.
- **Release workflow** — CI publishes to the VS Code marketplace
  on tagged releases.
- **`examples/scenarios/*`** — all nine scenario sub-packages
  fully implemented with dedicated README walkthroughs.

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

- **Internal planning references removed** — stale describe-block
  names, comments, and doc strings that referenced internal
  project-phase shorthand were rewritten in neutral language so
  external readers of the test suite are not confronted with
  workflow jargon.

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
