# Session Handoff — css-module-explainer

**Date:** 2026-04-10 (updated after Plans 06–10 + 5-agent final review)
**Status:** Phases 0–10 complete, 218 tests passing, 0 lint warnings, 0 eslint-disables, ready for Plan 09.5 (code-actions) or Plan Final (references).

---

## 1. Progress snapshot

| Phase | Plan | Status | Tests |
|---|---|---|---|
| 0 Scaffolding | Plan 01 | ✅ | 2 |
| 1 SCSS Indexing | Plan 02 | ✅ | +31 |
| 2+3 Cx AST | Plan 03 | ✅ | +43 |
| 4 TS + resolver | Plan 04 | ✅ | +36 |
| 5 Indexing infra | Plan 05 | ✅ | +51 |
| 6 Definition | Plan 06 | ✅ + 3-agent review applied | +14 |
| 7 Hover | Plan 07 | ✅ | +11 |
| 8 Completion | Plan 08 | ✅ | +7 |
| 9 Diagnostics | Plan 09 | ✅ | +6 |
| 10 Indexer real | Plan 10 | ✅ | +3 |
| Lint-disable cleanup | — | ✅ 6→0 | — |
| 5-agent final review | — | ✅ applied | +8 |
| **9.5 Code actions** | **Plan 09.5** | **← NEXT** | |
| 10.5 Tier 3 E2E | Plan 10.5 | ⬜ | |
| 11 Benchmarks | Plan 11 | ⬜ | |
| 11.5 Examples | Plan 11.5 | ⬜ | |
| 12 Docs | Plan 12 | ⬜ | |
| Final References | Plan Final | ⬜ | |
| Release | Plan Release | ⬜ | |

**Current:** 218 tests passing, 40+ commits, `pnpm check && pnpm test && pnpm build` all green.

---

## 2. What the Plan 06–10 sprint delivered

### Providers
- **`providers/definition.ts`** — `handleDefinition(params, deps)` returns `LocationLink[]` with origin/target ranges for peek view (spec §4.2).
- **`providers/hover.ts` + `hover-renderer.ts`** — Markdown hover card with single-match and multi-match layouts (MAX_CANDIDATES = 10), workspace-relative path formatting (spec §4.3).
- **`providers/completion.ts`** — `CompletionItem[]` when cursor is inside an open `cx('` call. Trigger chars: `'`, `"`, `` ` ``, `,` (spec §4.4).
- **`providers/diagnostics.ts`** — Per-call classification (static / template / variable) with did-you-mean hint via `findClosestMatch`. 200ms debounced push model with per-call error isolation (spec §4.5 + §2.8).
- **`providers/lsp-adapters.ts`** — Shared `toLspRange` for every provider returning LSP `Range`-bearing types.

### Composition root
- **`server/src/composition-root.ts`** — `createServer({reader, writer, overrides})` factory. Options expose test-only injections (`typeResolver`, `readStyleFile`, `createProgram`, `fileSupplier`, `readStyleFileAsync`). Deps built inside `onInitialize` because `workspaceRoot` is not known at module load.
- **`server/src/server.ts`** — 3-line entrypoint passing `process.stdin/stdout`.

### Infrastructure
- **`core/indexing/file-supplier.ts`** — `scssFileSupplier(workspaceRoot, logger)` walks the workspace via `fast-glob`, yielding `FileTask` per `.module.{scss,css}` file outside `node_modules`/`dist`/`.git`. Error-catching for partial walks.
- **`core/indexing/indexer-worker.ts`** — Refactored to `for await (const task of this.drain())` consuming a private async generator. Uses `node:timers/promises` `setImmediate` for LSP preemption. Per-file error isolation: a pathological SCSS file logs and is skipped; initial walk continues.
- **File watcher** — `connection.onDidChangeWatchedFiles` invalidates `styleIndexCache`, re-pushes changed file through `IndexerWorker.pushFile`, and reschedules diagnostics on every open doc. Dynamic registration guarded by client capability check.

### Test infrastructure
- **Tier 2 harness** at `test/protocol/_harness/in-process-server.ts` — full-duplex PassThrough pair wired to `createServer`, client side exposes `initialize / didOpen / didChange / definition / hover / completion / waitForDiagnostics / didChangeWatchedFiles / shutdown`. Streams pre-wrapped in `StreamMessageReader/Writer` to avoid vscode-languageserver's `process.exit` handlers.
- **Tier 2 test files** — lifecycle, definition, hover, completion, diagnostics, file-watcher.

---

## 3. Invariants to preserve in Plans 09.5+

### 3.1 One parse per file
`DocumentAnalysisCache.get(uri, content, filePath, version)` is the ONLY place that calls `ts.createSourceFile + detectCxBindings + parseCxCalls`. Providers must never call these directly. Plan 09.5 code-actions must go through `withCxCallAtCursor` if it needs AST context — or take the pure `Diagnostic.data.suggestion` shortcut.

### 3.2 Per-call error isolation (spec §2.8)
Every provider's top-level `try/catch` must log via `deps.logError` and return the empty shape (`null` or `[]`). **Diagnostics additionally isolates at the per-call level** — a single throwing cx() call must not erase other diagnostics in the same document. Plan 09.5 code-actions should follow the same pattern.

### 3.3 `CxCallContext` spec-locked
Four fields only: `{ call, binding, classMap, entry }`. Do not add new fields. Providers read `deps`/`params` via closure.

### 3.4 `ProviderDeps.logError` is REQUIRED
After the 5-agent review, `logError` is no longer optional. Tests use `NOOP_LOG_ERROR` from `provider-utils.ts`. All new deps-consuming tests must include it.

### 3.5 `DocumentParams` vs `CursorParams`
`CursorParams extends DocumentParams`. Document-wide helpers (diagnostics, code-actions) take `DocumentParams`. Cursor helpers take the full `CursorParams`. No `Pick<CursorParams, ...>` gymnastics.

### 3.6 `reverseIndex.record()` hot-path skip
`withCxCallAtCursor` skips the `callSites.map(...)` allocation when `deps.reverseIndex.record === NullReverseIndex.prototype.record`. **Phase Final MUST move the record call from provider-utils to `DocumentAnalysisCache.analyze()`** when `WorkspaceReverseIndex` is swapped in, so it fires once per (uri, version) instead of once per provider request.

### 3.7 Capability registration order
`definitionProvider`, `hoverProvider`, `completionProvider.triggerCharacters` are all hardcoded `true`/explicit in the initialize response. Plan 10/12 will introduce a `config.features.*` layer; until then, just add new capabilities inline next to the existing ones.

### 3.8 Dynamic registration gated on client capability
`DidChangeWatchedFilesNotification` register is wrapped in `if (clientSupportsDynamicWatchers)` — set during `onInitialize` from `params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration`. New dynamic registrations (e.g., config change notifications) must follow the same pattern.

### 3.9 Lint policy: zero disables
As of the lint-disable cleanup commit, `grep -r 'eslint-disable' server/src test` returns zero hits. New code must follow suit — use `for await` patterns, Promise primitives, or structural refactors instead of suppressing rules.

---

## 4. Key files added by Plans 06–10

```
server/src/
├── composition-root.ts              (367 lines, the DI hub)
├── server.ts                        (3-line entrypoint)
├── core/indexing/
│   ├── file-supplier.ts             (fast-glob streaming walker)
│   └── indexer-worker.ts            (refactored to for-await + sync drain)
└── providers/
    ├── definition.ts
    ├── hover.ts
    ├── hover-renderer.ts
    ├── completion.ts
    ├── diagnostics.ts
    ├── lsp-adapters.ts              (toLspRange)
    └── provider-utils.ts            (DocumentParams + NOOP_LOG_ERROR added)

test/
├── protocol/
│   ├── _harness/in-process-server.ts
│   ├── lifecycle.test.ts
│   ├── definition.test.ts
│   ├── hover.test.ts
│   ├── completion.test.ts
│   ├── diagnostics.test.ts
│   └── file-watcher.test.ts
└── unit/providers/
    ├── definition.test.ts
    ├── hover.test.ts
    ├── hover-renderer.test.ts
    ├── completion.test.ts
    └── diagnostics.test.ts
```

---

## 5. Review cycle outcomes

- **Plan 06**: 3-agent review (A → B → C), 5 MUST-FIX from A, B downgraded 4, C adjudicated. Final applied: structured logError wiring, harness hermeticity fix for `createDefaultProgram` findConfigFile leakage, lifecycle test rename, `definitionProvider: true` spec breadcrumb, smoke test for `createDefaultProgram`.
- **Plans 07–10**: no individual 3-agent reviews (user decision: "각과정마다 3agent 리뷰 있지말고").
- **Final 5-agent review** (after Plan 10): 5 parallel independent reviewers on axes: architecture, error handling, concurrency, tests, API design. Meta-evaluation + cross-validation applied inline. 17 findings applied, 7 deferred. Key wins: two critical error-handling bugs (H1 supplier swallow, H2 indexer process guard), one concurrency race (diagnostics timer self-delete), API tightening (logError required, dropped unused CompletionParams, DocumentParams extraction).
- **Lint-disable cleanup**: 6 eslint-disables → 0. `indexer-worker.ts` refactored to `for await` + sync generator, `in-process-server.ts` empty supplier rewritten as explicit AsyncIterator.

---

## 6. Next steps — Plan 09.5 onward

### Plan 09.5 — Code Actions (Quick Fix)
**Goal:** Consume `Diagnostic.data.suggestion` from the diagnostics provider and return a `CodeAction` that edits the source range to the suggested class name. Spec §4.5b.

**Tasks:**
1. `server/src/providers/code-actions.ts` — `handleCodeAction(params, deps)` → `CodeAction[] | null`
2. Wire `connection.onCodeAction` in composition-root.
3. Register `codeActionProvider: { codeActionKinds: ['quickfix'], resolveProvider: false }`.
4. Tier 1 unit tests: suggestion present → one quickfix; no suggestion → empty; exception path.
5. Tier 2 protocol test: Diagnostic with `data.suggestion` → codeAction call returns edit for the class token range.

### Plan 10.5 — Tier 3 E2E (heavy)
Downloads real VS Code via `@vscode/test-electron`, spawns the extension host, runs mocha tests against `vscode.executeDefinitionProvider` etc. May require opting out on local dev if network-gated.

### Plan 11 — Benchmark harness
`vitest bench` + `test/benchmark/`. Measure cold hover latency (spec §7 target ~18ms), incremental re-parse time, IndexerWorker walk throughput. Agent 3 H3 (sequential `readStyleFileAsync`) decision gate lands here.

### Plan 11.5 — Examples sandbox
`examples/` with 9 scenarios. Manual QA; not an automated test target.

### Plan 12 — Docs
README, CHANGELOG, walkthrough GIFs. Also update spec §4.1 to match actual `ProviderDeps` shape (Agent 5 F1 deferred work).

### Plan Final — References + WorkspaceReverseIndex
Swap `NullReverseIndex` for `WorkspaceReverseIndex` + tsx file walker. Implement `providers/references.ts` and `providers/reference-lens.ts`. **Move `reverseIndex.record()` from `provider-utils.ts` to `DocumentAnalysisCache.analyze()`** (invariant 3.6).

### Plan Release — 1.0.0
Version bump, `preview: false`, tag `v1.0.0`, marketplace publish.

---

## 7. Commit history reference (Plans 06–10 + reviews)

```
57f31ce refactor: apply 5-agent parallel review findings
5a5e72f refactor(indexer): drop every eslint-disable via for-await + sync drain
601f07f feat(indexing,server): real indexer + file watcher wiring (Phase 10)
5e9138f feat(providers): diagnostics provider (Phase 9)
a657db0 feat(providers): completion provider (Phase 8)
fc22791 feat(providers): hover provider + markdown renderer (Phase 7)
471bbe2 docs: add Plan 07 — hover provider (Phase 7)
dc272af refactor(phase-6): apply 3-agent review findings
89265e5 build(test): add test:protocol script for scoped Tier 2 runs
8b18cb0 test(protocol): definition — Tier 2 end-to-end scenarios
727cdbd test(protocol): lifecycle — first Tier 2 tests
b5f84b8 test(protocol): Tier 2 harness — in-process LSP server over PassThrough
6c6a05a feat(server): composition root — createServer({reader, writer, overrides})
7a406ff feat(providers): handleDefinition — first LSP request handler
a38143b docs: add Plan 06 — definition provider + Tier 2 harness (Phase 6)
```

---

**End of handoff.** Any question about "why is X this way" → start at `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md`, then the relevant plan doc in `docs/superpowers/plans/`, then §3 invariants above.
