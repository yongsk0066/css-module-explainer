# Session Handoff — css-module-explainer

**Date:** 2026-04-10
**Status:** Phases 0–5 complete, 170 tests passing, ready for Plan 06 (Phase 6 — definition provider).

---

## 1. What we're building

`css-module-explainer` — a VS Code LSP extension providing **Go to Definition, Hover, Autocomplete, and Diagnostics** for the `classnames/bind` `cx()` pattern with CSS Modules. Target: **1.0.0 marketplace publish** (not MVP).

**Scenario:**
```tsx
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
<div className={cx('button', { active: isActive })}>Click me</div>
```

Existing CSS-Modules extensions stop working once the chain passes through `classnames.bind()`. This extension picks up exactly there.

**Tech stack (pinned, non-negotiable):**
- `pnpm@10.30.3`, `typescript@^6.0.2`, `rolldown@1.0.0-rc.15`
- `vitest@^4.1.3`, `oxlint@^1.59.0`, `oxfmt@^0.44.0`
- `postcss@^8.5.9`, `postcss-scss@^4.0.9`
- `vscode-languageserver@^9.0.1`, `vscode-languageclient@^9.0.1`
- `@types/node@^25.5.0`, `@types/vscode@^1.115.0`

---

## 2. Current progress snapshot

| Phase | Plan | Status | Tests | Key files |
|---|---|---|---|---|
| 0 Scaffolding | Plan 01 | ✅ | 2 smoke | pnpm workspace, tsconfig, rolldown, vitest, oxlint, ci.yml, LICENSE |
| 1 SCSS Indexing | Plan 02 | ✅ | +31 | `scss/lang-registry.ts`, `scss/scss-index.ts` (Q6 B edges), `StyleIndexCache` |
| 2+3 Cx AST | Plan 03 | ✅ | +43 | `cx/binding-detector.ts` (Q7 B), `cx/call-parser.ts` (Q3 B+D) |
| 4 TS + resolver | Plan 04 | ✅ | +36 | `ts/source-file-cache.ts`, `ts/type-resolver.ts`, `cx/call-resolver.ts` |
| 5 Indexing infra | Plan 05 | ✅ | +51 | `indexing/{document-analysis-cache,reverse-index,indexer-worker}.ts`, `util/text-utils.ts`, `providers/provider-utils.ts` |
| **6 Definition** | **Plan 06** | **← NEXT** | | `providers/definition.ts` + Tier 2 harness |
| 7 Hover | Plan 07 | ⬜ | | `providers/hover.ts` + `hover-renderer.ts` |
| 8 Completion | Plan 08 | ⬜ | | `providers/completion.ts` |
| 9 Diagnostics | Plan 09 | ⬜ | | `providers/diagnostics.ts` |
| 9.5 Code actions | Plan 09.5 | ⬜ | | `providers/code-actions.ts` |
| 10 Indexer real | Plan 10 | ⬜ | | `scssFileSupplier`, file watcher wiring |
| 10.5 Tier 3 E2E | Plan 10.5 | ⬜ | | `@vscode/test-electron` |
| 11 Benchmarks | Plan 11 | ⬜ | | `test/benchmark/` |
| 11.5 Examples | Plan 11.5 | ⬜ | | `examples/` (Vite+ sandbox, 9 scenarios) |
| 12 Docs | Plan 12 | ⬜ | | README, CHANGELOG, walkthrough |
| Final References | Plan Final | ⬜ | | `WorkspaceReverseIndex`, references + reference-lens |
| Release | Plan Release | ⬜ | | 1.0.0 marketplace |

**Current totals:** 170 tests passing, 33 commits, `pnpm check && pnpm test && pnpm build` all green.

---

## 3. File structure (source of truth)

```
css-module-explainer/
├── docs/
│   ├── code-philosophy.md                          # user's manifesto — review criterion
│   └── superpowers/
│       ├── specs/2026-04-09-css-module-explainer-design.md
│       ├── plans/2026-04-09-plan-0{1..5}-*.md
│       └── handoff/2026-04-10-session-handoff.md  # THIS FILE
├── shared/src/
│   ├── types.ts                                    # 12 types, all data, no runtime
│   └── index.ts
├── server/src/
│   ├── server.ts                                   # LSP bootstrap (minimal, no handlers yet)
│   ├── core/
│   │   ├── scss/
│   │   │   ├── lang-registry.ts                    # STYLE_LANGS + helpers
│   │   │   └── scss-index.ts                       # parseStyleModule + StyleIndexCache
│   │   ├── cx/
│   │   │   ├── binding-detector.ts                 # detectCxBindings (Q7 B)
│   │   │   ├── call-parser.ts                      # parseCxCalls (Q3 B+D)
│   │   │   └── call-resolver.ts                    # resolveCxCallToSelectorInfos
│   │   ├── ts/
│   │   │   ├── source-file-cache.ts                # in-flight LRU
│   │   │   └── type-resolver.ts                    # TypeResolver + WorkspaceTypeResolver
│   │   ├── indexing/
│   │   │   ├── document-analysis-cache.ts          # single-parse hub
│   │   │   ├── reverse-index.ts                    # interface + NullReverseIndex
│   │   │   └── indexer-worker.ts                   # background loop skeleton
│   │   └── util/
│   │       ├── hash.ts                             # contentHash (md5)
│   │       └── text-utils.ts                       # getLineAt, Levenshtein, URL helpers
│   └── providers/
│       └── provider-utils.ts                       # withCxCallAtCursor, isInsideCxCall
├── client/src/extension.ts                         # LanguageClient bootstrap
├── test/unit/                                      # 170 tests, all Tier 1
└── dist/                                           # rolldown output (client/ + server/)
```

**Layer rules (enforced manually, lint rules deferred to Plan 06):**
- `scss/` ↛ `cx/`, `ts/`, `indexing/`
- `cx/` imports `scss/lang-registry` (neutral data) + `ts/` interfaces only
- `ts/` ↛ `scss/`, `cx/`, `indexing/`
- `indexing/` composes `scss/ + cx/ + ts/ + util/`
- `providers/` imports `core/indexing/*` + `core/ts/type-resolver` (type-only) + `core/util/*`
- `shared/` has **zero runtime imports**

---

## 4. Key invariants a new session MUST preserve

### 4.1 The "one parse per file" principle
`DocumentAnalysisCache` is the single enforcement point. **Providers must NEVER call `ts.createSourceFile`, `detectCxBindings`, or `parseCxCalls` directly** — they go through `deps.analysisCache.get(uri, content, filePath, version)`. Plan 06 should add a lint rule forbidding direct imports.

### 4.2 2-tier TypeScript
- **In-flight** (`SourceFileCache`): live editor text, `ts.createSourceFile`, used by binding-detector + call-parser
- **Workspace** (`WorkspaceTypeResolver`): `ts.Program` + tsconfig, used ONLY for `cx(unionVar)` type resolution

These have **different caches and different lifecycles**. Never unify.

### 4.3 Phase Final seam (critical)
`ReverseIndex` interface + `NullReverseIndex` are live from Phase 5. Every provider that gets cx call data **must call `reverseIndex.record()` unconditionally** through `withCxCallAtCursor`. Phase Final (much later) swaps in `WorkspaceReverseIndex` with zero provider code changes.

**⚠️ TODO for Phase Final:** `reverseIndex.record()` is currently called on every hover/definition hot path. When `WorkspaceReverseIndex` is wired in, **move this call from `provider-utils.ts:withCxCallAtCursor` to `DocumentAnalysisCache.analyze()`** so it fires once per (uri, version) instead of once per request. There's a TODO comment at the call site.

### 4.4 CxCallContext is spec-locked
The shape is `{ call, binding, classMap, entry }` — four fields, from design doc section 4.1. Plan 05 review caught a drift that added 5 extra fields; do not re-introduce them. Providers access `deps`, `params`, etc. via closure in their outer function scope.

### 4.5 Content hash lives in ONE place
`server/src/core/util/hash.ts` exports `contentHash(content)`. It's currently md5. Swapping to xxhash is a one-function change. Do not duplicate the helper.

### 4.6 oxlint/oxfmt gotchas
- `server/tsconfig.json` has `"types": ["node"]` — required for `setImmediate`, `URL`, etc.
- `.oxlintrc.json` has `"env": { "node": true, "es2022": true }` — same reason at lint time.
- `format` scripts scope out docs: `oxfmt --write . '!docs/**'`. Don't let oxfmt touch the spec or plans.
- `oxfmt.toml` does NOT exist — real config would be `.oxfmtrc.json`. Tried, didn't need one.
- `.vscode/*` is in `.gitignore` with `!` re-includes for `launch.json`, `tasks.json`, `extensions.json`. Use `.vscode/*` pattern, not `.vscode/` (latter ignores directory entirely and breaks `!` rules).

### 4.7 `node-version-file: .nvmrc` in CI
Node version is single-sourced in `.nvmrc` (`22`). `pnpm/action-setup@v4` reads `packageManager` from `package.json` — no explicit version in CI jobs.

---

## 5. Review workflow (USER REQUIREMENT — mandatory for every phase)

Every Plan from Plan 02 onward MUST end with a **3-agent review cycle**:

1. **Agent A** — code-philosophy 1차 리뷰. Reads all source + test files. Answers 9–10 specific questions about Cognitive Flow, Abstraction-as-Wall, Contextual Locality, anti-patterns, test quality, layer rules. Produces concrete recommendations with file+line+severity (blocker/should-fix/nice-to-have/nit/reject).

2. **Agent B** — meta-reviewer. Verifies Agent A's factual claims, identifies overreach, catches missed issues. Outputs VALID / VALID-WITH-CAVEATS / INVALID verdict. Recalibrates severities.

3. **Agent C** — third-level meta-evaluator. Verifies Agent B's claims (especially new blockers), catches Agent B's own overreach, produces final synthesized change list. Outputs FAIR / FAIR-WITH-OVERREACH / UNFAIR verdict on Agent B.

**Then I apply** the final change list: **blockers + must-fix** always, **nice-to-have** case-by-case, **rejected** items not touched.

**Anti-flattery rule:** agents must not praise boring-correct code. They're calibrated to find problems.

**Philosophy criterion:** `docs/code-philosophy.md`. Core principle: **minimize cognitive load**. 4 principles (Cognitive Flow, Contextual Locality, Abstraction-as-Wall, Declarative by Default). Diagnostics: 3-File Rule, Narration Test, Naming Sufficiency, Grep Friendliness.

**Plan 01 (scaffolding) was exempt** from reviews per user decision — "실제 코드 작업부터 해". All subsequent plans get the full 3-agent cycle.

---

## 6. Execution pattern (per plan)

```
1. Write Plan doc → docs/superpowers/plans/YYYY-MM-DD-plan-NN-*.md
2. Commit plan doc
3. For each task in the plan:
   a. Write source file(s)
   b. Write test file(s)
   c. Run pnpm format && pnpm check && pnpm test && pnpm build
   d. If red, fix. If green, commit with a conventional message.
4. After the plan's implementation is complete:
   a. Run 3-agent review cycle (Agent A → B → C)
   b. Synthesize final change list
   c. Apply must-fix items
   d. Commit as "refactor(phase-N): apply 3-agent review findings"
5. Update this STATUS doc if invariants change
```

**Standard pipeline command:**
```bash
pnpm format && pnpm check && pnpm test && pnpm build
```

**Commit conventions:**
- `docs(...)` for plans/specs
- `feat(scope)` for new code
- `refactor(scope)` for post-review changes
- `build(...)` for tooling
- `chore(...)` for misc
- `test(...)` for test-only changes

**Heredoc for multi-line commits:**
```bash
git commit -m "$(cat <<'EOF'
feat(scope): short title

Longer body explaining the why, not the what.
Wrap at 72 chars for subject, any width for body.
EOF
)"
```

---

## 7. Next steps — Plan 06 onward

### Plan 06 — Definition Provider + Tier 2 Harness (Phase 6)

**Goal:** First real LSP request handler. `textDocument/definition` returns `LocationLink[]` pointing at SCSS selector definitions.

**Tasks:**
1. `server/src/providers/definition.ts` — `handleDefinition(params, deps): LocationLink[] | null`
2. Wire the handler into `server/src/server.ts` via `connection.onDefinition(...)`
3. **NEW: Tier 2 harness** at `test/protocol/_harness/in-process-server.ts` — in-process LSP via two `PassThrough` streams, `LspTestClient` wrapper exposing `initialize`, `didOpen`, `definition`, etc.
4. `test/protocol/lifecycle.test.ts` — minimal initialize/shutdown
5. `test/protocol/definition.test.ts` — static, template, variable cases
6. `test/unit/providers/definition.test.ts` — unit tests with mock deps

**Spec refs:** section 4.2 (definition provider), section 8.3 (Tier 2 harness)

**Key design points:**
- Return shape: `LocationLink[]` (not `Location[]`) so VS Code can render origin highlight + peek preview
  - `originSelectionRange: call.originRange` — the class token in source
  - `targetUri: pathToFileUrl(binding.scssModulePath)`
  - `targetRange: info.ruleRange` — full SCSS rule block for peek
  - `targetSelectionRange: info.range` — class token position for cursor placement
- Multi-match: template / variable → multiple `LocationLink` → VS Code auto-picker
- Empty match: return `null` (not `[]`) so other providers can attempt
- Error: top-level `try/catch`, log + return `null`, never crash the server

**New composition-root wiring needed in `server.ts`:**
- Instantiate `SourceFileCache`, `StyleIndexCache`, `DocumentAnalysisCache`, `WorkspaceTypeResolver`, `NullReverseIndex`
- Build `ProviderDeps` bag
- `connection.onDefinition(p => handleDefinition(toCursorParams(p), deps))`
- Register `definitionProvider: true` in `onInitialize` capabilities

### Plans 07–09.5 — Hover, Completion, Diagnostics, Code Actions

Each follows Plan 06's structure: new provider + Tier 2 protocol test + 3-agent review. Spec sections 4.3, 4.4, 4.5, 4.5b.

### Plan 10 — Indexer + File Watcher Real

Replace `IndexerWorker.deps.supplier` skeleton with real `scssFileSupplier(workspaceRoot)` using `fast-glob`. Wire `DidChangeWatchedFilesNotification` registration. Hook invalidation cascade.

### Plan 10.5 — Tier 3 E2E

`@vscode/test-electron` + mocha. Downloads real VS Code, spawns with extension, runs `vscode.executeDefinitionProvider` etc. `test/e2e/runTest.ts`, `test/e2e/workspace/` fixture.

### Plan Final — References + Reference Lens

Implement `WorkspaceReverseIndex`. Swap out `NullReverseIndex`. Register `referencesProvider` + `codeLensProvider`. **Also move `reverseIndex.record()` call from `provider-utils.ts` to `DocumentAnalysisCache.analyze()`** (see invariant 4.3).

### Plan Release — 1.0.0

Version bump, `preview: false`, tag `v1.0.0`, marketplace publish.

---

## 8. Known limitations (documented in code/JSDoc, deferred)

1. **`findIdentifierSymbol` scope shadowing** (`ts/type-resolver.ts`) — Document-order DFS matches by name only, ignores lexical scope. `const size = "outer"; function f({ size }: Props)` → outer wins. Fix when Phase 6 hover-on-shadowed-identifier test fails. JSDoc has a "Known limitation" block.

2. **`cx(props.variant)` PropertyAccess** (`cx/call-parser.ts`) — Variable branch accepts bare Identifier only. Member access paths silently skipped. Deferred until Phase 4 type-resolver can handle property path resolution.

3. **`import * as styles from ...` namespace imports** (`cx/binding-detector.ts`) — Only default imports tracked. Namespace imports and `import { bind } from 'classnames'` silently skipped. JSDoc documents these intentional limitations.

4. **`(classNames as typeof cn).bind(styles)` type assertions** (`cx/binding-detector.ts`) — Fails `isIdentifier` check on `ParenthesizedExpression`. Intentional limitation, documented.

5. **`:global` inside nested groups** — Current `:global(.foo)` stripping is regex-based. Complex `:global(.a, .b)` may edge-case. Not tested beyond basic case.

6. **`cx("(")` inside `isInsideCxCall`** — The paren walker is naive; string-literal parens count toward depth. Low impact in practice. Consider renaming to `approximatelyInsideCxCall` when Plan 08 (completion) lands.

7. **`IndexerWorker` infinite supplier** — Current Phase 5 skeleton is OK with finite suppliers. Phase 10 real supplier is expected to be a one-shot walk; file-watcher-driven pushFile goes through the pending queue. If a long-running watcher is introduced later, the interleaved queue Phase 5 installed handles it.

8. **Lone `\r` line endings** (`text-utils.getLineAt`) — Only handles `\n` and `\r\n`. Classic Mac endings are extinct in 2026.

9. **Windows path round-trip** — Not tested. `node:url` handles it, but no regression test.

---

## 9. Review findings patterns (so new session doesn't repeat mistakes)

Across 4 review cycles (Plans 02–05), these patterns keep appearing:

- **Helper function duplication** (Plan 04): `contentHash` was duplicated. Always extract utility functions the moment a second use appears. `server/src/core/util/` is the home.
- **Test helper duplication** (Plan 04): `makeHost` was copied twice in the same test file. Hoist test helpers to the top of the file.
- **Spec drift** (Plan 05): `CxCallContext` grew 5 extra fields that weren't in the spec. Always cross-check implementation against the design doc. The spec is section 4.1 of `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md`.
- **Premature defensive tests** (Plan 05): Asserting that a no-op method (NullReverseIndex.count/forget/clear) returns empty is test pollution. Delete.
- **Hidden hot-path overhead** (Plan 05): `reverseIndex.record()` on every provider call is free today but expensive in Phase Final. Mark these with a TODO comment.
- **oxlint rule conflicts** (Plans 04–05): `no-new-array`, `no-await-in-loop`, `consistent-function-scoping`, `no-array-sort`. Know the fixes:
  - `new Array<T>(n)` → `Array.from<T>({ length: n })`
  - `.sort()` → `.toSorted()`
  - `await` in sequential loop → `// eslint-disable-next-line no-await-in-loop` with justification comment
  - Test helper closures → hoist to module scope
- **Format-on-commit drift**: `pnpm format` always reformats files. Run it before `pnpm check`, not after.

---

## 10. Commit history reference

```
9d245b9 refactor(phase-5): apply 3-agent review findings — spec alignment + bugs
6691999 feat(phase-5): indexing infrastructure + provider-utils
d721fad docs: add Plan 05 — indexing infrastructure + provider-utils (Phase 5)
d3c014d refactor(phase-4): apply 3-agent review findings
67d13b7 feat(ts,cx): Phase 4 — source-file cache + type-resolver + call-resolver
24d6d8a docs: add Plan 04 — TypeScript 2-tier + call-resolver (Phase 4)
371fc83 refactor(cx): apply Plan 03 3-agent review findings — docs + tests
23c9951 feat(cx): AST-based cx() call parser covering Q3 B+D
6b5930f feat(cx): AST-based CxBinding detection covering Q7 B cases
8b2def3 feat(shared): add CxBinding and CxCallInfo discriminated-union types + add typescript as server runtime dep
0402941 docs: add Plan 03 — cx binding detection + call parsing (Phases 2+3)
577f0da refactor(scss): apply 3-agent review findings — bugs + readability
d2fba5c feat(scss): parseStyleModule with Q6 B edges + StyleIndexCache
9a4206d feat(scss): add shared types, postcss deps, and lang-registry
ca16be4 docs: add Plan 02 — SCSS Indexing (Phase 1)
(Plan 01 + initial spec below — 33 commits total)
```

---

## 11. Start-of-session checklist for a resumed session

```bash
cd /Users/yongseok/dev/css-module-explainer

# 1. Confirm the workspace is green
pnpm check && pnpm test

# 2. Read this doc
cat docs/superpowers/handoff/2026-04-10-session-handoff.md

# 3. Read the next plan if it exists, otherwise read the spec section for the phase
ls docs/superpowers/plans/

# 4. Check git status and last 10 commits
git status
git log --oneline | head -10

# 5. Begin the next plan (Plan 06)
```

**If Plan 06 is already written:** execute task-by-task with 3-agent review at the end.
**If Plan 06 is not written yet:** write it first following the pattern of Plans 02–05 (spec refs, end state, file structure, task-by-task with test-first TDD).

---

**End of handoff.** Any question about "why is X this way" should first check `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md` (the design contract) and then the relevant plan doc. If neither answers it, the invariant section above (§4) is the next stop.
