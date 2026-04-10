# Changelog

All notable changes to this project will be documented in this
file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
