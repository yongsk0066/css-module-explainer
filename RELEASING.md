# Releasing

This document describes the current release procedure.

It is an operations document. It should not contain rollout history or project
planning notes.

## Branches

- `master`: stable releases
- `next`: preview releases

## Version rules

Stable and preview releases both use numeric extension versions.

Allowed:

- `3.2.0`
- `3.2.1`
- `3.3.0`
- `3.4.0`
- `3.5.0`
- `3.6.0`
- `3.7.0`
- `3.8.0`
- `3.9.0`
- `3.10.0`
- `3.11.0`
- `3.12.0`
- `3.13.0`
- `3.14.0`

Do not use:

- `3.2.0-alpha.1`
- `3.2.0-beta.1`

VS Code Marketplace preview publishing requires:

1. `major.minor.patch` version strings
2. `--pre-release` packaging and publishing for preview builds

A version used for preview must not be reused later for stable.

Reference:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions

## Channels

Stable:

- branch: `master`
- workflow input: `channel=stable`

Preview:

- branch: `next`
- workflow input: `channel=preview`

Open VSX does not document preview behavior the same way Marketplace does. Use
Marketplace as the primary preview channel. Treat Open VSX preview publishing as
optional.

Reference:

- https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions

## Pre-release verification

Before a release:

```bash
pnpm install
pnpm release:verify
pnpm check:plugin-consumer-example
pnpm check:plugin-consumers
pnpm test:extension-host
pnpm check:rust-parser-public-product
pnpm check:rust-lane-bundle
pnpm check:rust-release-bundle
pnpm check:semantic-smoke
pnpm check:release-batch
pnpm check:contract-parity-v2-smoke
pnpm check:contract-parity-v2-golden
pnpm --dir examples exec tsc -p tsconfig.json --noEmit
pnpm --dir examples build
pnpm exec vsce package --no-dependencies
```

`pnpm release:verify` does:

1. sync `SERVER_VERSION`
2. run `pnpm check`
3. run `pnpm check:plugin-consumer-example`
4. run `pnpm check:plugin-consumers`
5. run `pnpm check:rust-release-bundle`
6. run `pnpm test`
7. run `pnpm build`

`pnpm check:semantic-smoke` is the canonical semantic smoke pass. It is not the
release gate yet. It gives one repeatable workspace/checker sanity check before
packaging.

`pnpm check:plugin-consumer-example` verifies the clean repo-local example
workspace under both lint consumers. It is the closest release-facing check for
copy-paste setup viability.

`pnpm check:plugin-consumers` is the current plugin-facing consumer batch gate.
It runs the ESLint and Stylelint smoke consumers together, so user-facing
lint-plugin regressions are exercised before packaging.

The smoke corpus is defined in `scripts/semantic-smoke-corpus.ts`. Treat that
file as the release-facing semantic fixture list. Update it when a new semantic
surface becomes release-relevant.

`pnpm check:contract-parity-v2-smoke` verifies that the canonical engine
contracts can still be assembled across the parity corpus.

`pnpm check:contract-parity-v2-golden` verifies the normalized
`EngineInputV2` / `EngineOutputV2` golden fixtures under
`test/_fixtures/contract-parity-v2/`.

`pnpm check:rust-parser-public-product` is the canonical parser/public-product
gate. It currently runs `pnpm check:rust-parser-lane` plus
`pnpm check:rust-parser-consumer-boundary`, so the parser canonical-candidate,
parser evaluator-candidates, parser canonical-producer, and one bounded
downstream consumer check all stay green together.

`pnpm check:rust-checker-entrance` is the current official checker-canonical
entrance gate. It currently aliases `pnpm check:rust-checker-bounded-lanes`,
which runs the bounded `style-recovery` and `source-missing` checker lanes.
That checker entrance is now included in both the broader Rust lane and the
default stable release gate.

`pnpm check:rust-checker-promotion-review` is the operator check for that
promotion decision. It validates the current checker-lane gate metadata and
confirms the bounded checker lanes are now inside both `rust-lane-bundle` and
`rust-release-bundle`.

`pnpm check:rust-checker-broader-lane-readiness` locks the broader-lane
promotion criteria for those bounded checker lanes. It currently requires two
bounded lanes, a shared promotion-review command, and a broader target of
`pnpm check:rust-lane-bundle`. The current state is that both lanes are
promoted into the broader Rust lane and enforced in the release gate.

`pnpm check:rust-checker-real-project-bounded` adds one more promotion-evidence
layer on top of the smoke fixtures. It validates the bounded checker lanes
against a small multi-file real-project-like corpus, so promotion decisions do
not rely on smoke-only evidence.

`pnpm check:rust-checker-promotion-evidence` is the aggregate operator command
for checker-lane promotion evidence. It currently runs promotion review,
broader-lane readiness, and the bounded real-project corpus check.

`pnpm check:rust-checker-release-gate-readiness` locks the release-gate
promotion criteria for those checker lanes. It currently requires broader-lane
promotion evidence, a release target of `pnpm check:rust-release-bundle`, a
shadow soak target of `pnpm check:rust-checker-release-gate-shadow`, and the
same minimum bounded-lane count of `2`. The current state is now
`includedInRustReleaseBundle=true` for both lanes.

`pnpm check:rust-checker-release-gate-shadow` is the current post-enforcement
observation soak for checker entrance. It runs `pnpm check:rust-release-bundle`,
`pnpm check:rust-checker-entrance`, and `pnpm check:rust-checker-promotion-evidence`
together after the checker lanes have already been enforced in the release bundle.

`.github/workflows/checker-release-gate-shadow.yml` runs the same shadow soak on
every `master` push. It builds the repo artifacts and the `server/engine-core-ts`
and `server/engine-host-node` dist outputs required by
`pnpm check:rust-gate-evidence`, then executes the release bundle components,
checker entrance, and promotion evidence as separate workflow steps so failures
remain attributable after the stable release gate flip.

`pnpm check:ts7-phase-a-readiness` is the current pre-adoption gate for the
TS 7 beta path. `pnpm check:ts7-phase-a-shadow` is the current non-release
shadow path for that same tsgo backend lane. The explicit tsgo-backed
operational commands are:

- `pnpm check:release-batch-tsgo`
- `pnpm check:real-project-corpus-tsgo`
- `pnpm check:lsp-server-smoke-tsgo`

`pnpm check:ts7-phase-a-shadow` runs those two tsgo-backed operational
commands plus the tsgo-backed LSP smoke together.

`pnpm check:ts7-phase-a-stability` is the direct stability check for the two
tsgo-specific risk points that the basic shadow path does not prove by itself:
repeated `EngineInputV2.typeFacts` ordering stability and concurrent
checker-process output stability under `CME_TYPE_FACT_BACKEND=tsgo`. The
deprecated alias `CME_TYPE_FACT_BACKEND=tsgo-preview` is still accepted. It
now also pins tsgo invocations to `@typescript/native-preview@beta` and
repeats backend smoke under fixed `--checkers` values (`1`, `2`, `4`).

`pnpm check:ts7-phase-a-tsgo-lane` is the current limited non-release
aggregate for Phase A. It runs the readiness gate, non-release shadow path,
stability check, and the repo build together.

`.github/workflows/ts7-phase-a-shadow.yml` runs the readiness gate plus that
non-release shadow path on every `master` push and on manual dispatch. It now
also builds the repo first and includes the stability check. This workflow is
observational only; it is not part of `pnpm check:rust-release-bundle`.

`pnpm check:ts7-phase-a-shadow-review` is the current operator review command
for that workflow. It reads recent `TS7 Phase A Shadow` history through `gh`
and reports whether the repo has accumulated the current minimum of `3`
successful shadow runs before any broader backend adoption judgment.

`pnpm check:ts7-phase-a-decision-ready` is the current Phase A lock point. It
requires both the local limited tsgo lane and the shadow-run threshold to be
green before any broader tsgo adoption judgment.

`pnpm check:ts7-phase-b-protocol-tsgo` is the first bounded protocol-layer
tsgo path for TS 7 beta Phase B. It runs a focused subset of protocol tests
(`lifecycle`, `hover`, `definition`, `diagnostics`, `completion`) under
`CME_TYPE_FACT_BACKEND=tsgo`.

`pnpm check:ts7-phase-b-editing-tsgo` is the second bounded protocol-layer
tsgo path for TS 7 beta Phase B. It runs the editing/reference subset
(`references`, `rename`, `code-actions`) under
`CME_TYPE_FACT_BACKEND=tsgo`.

`pnpm check:ts7-phase-b-build-tsgo` is the current bounded build-mode
tsgo path for TS 7 beta Phase B. It runs
`@typescript/native-preview@beta -b server/tsconfig.json --checkers 2 --builders 2`.

`pnpm check:ts7-phase-b-workspace-build-tsgo` is the current workspace-level
project-reference tsgo path for TS 7 beta Phase B. It runs
`@typescript/native-preview@beta -b tsconfig.json --checkers 2 --builders 2`.

`pnpm check:ts7-phase-b-readiness` is the current entry check for Phase B. It
requires `pnpm check:ts7-phase-a-decision-ready` first, then the bounded
protocol tsgo, editing tsgo, server build tsgo, and workspace build tsgo
subsets.

`pnpm check:tsgo-operational-lane` is the current bounded non-release
operational lane for the tsgo backend. It runs the local
`pnpm check:ts7-phase-a-tsgo-lane` plus the bounded Phase B protocol,
editing, server-build, and workspace-build tsgo subsets.

`pnpm check:selected-query-boundary` is the current local lock point for the
`3.9` selected-query/editor-path transition. It exercises the protocol subset
for `definition`, `hover`, `completion`, `references`, `rename`, and
`codeLens` after those providers have been routed through `engine-host-node`
helpers instead of directly owning the main core query/rewrite reads inside the
LSP layer. It is a milestone boundary, not a stable release gate.

`pnpm check:rust-selected-query-consumers` is the current local lock point for
the first live Rust selected-query consumer slice. It exercises the explicit
unit/runtime coverage for the opt-in Rust consumer paths currently wired into
source `definition`, source `hover`, style `hover` usage-summary resolution,
style `reference-lens` title/count summary resolution, style module usage /
style diagnostics unused-selector resolution, `explain-expression`, source
diagnostics symbol-ref invalid-class analysis, and host-side `engine-query-v2`
query-result emission for
`source-expression-resolution`, `expression-semantics`, and `selector-usage`.
It is a milestone boundary, not a stable release gate and not yet a default
selected-query backend flip.

`pnpm check:editor-path-boundary` is the current local lock point for the
editor-path runtime transition after the selected-query cut. It runs
`pnpm check:selected-query-boundary` plus the protocol subset for
`diagnostics`, `scss-diagnostics`, watched-file invalidation,
workspace-folder changes, and settings reload after those paths have been
routed through `engine-host-node` helpers or runtime aggregates. It is a
milestone boundary, not a stable release gate.

`pnpm check:operational-lane` is the current limited non-release default lane.
Today it resolves to the tsgo-backed operational lane.

`.github/workflows/tsgo-operational-shadow.yml` is the observational workflow
for that lane. It builds the repo, runs the tsgo-backed release batch,
real-project corpus, LSP smoke, and the full operational lane as separate
steps, and records repeatable shadow history for the next limited non-release
default judgment.

`pnpm check:operational-shadow-review` is the current limited non-release
default review command. Today it resolves to
`pnpm check:tsgo-operational-shadow-review`, which reads recent
`TSGO Operational Shadow` history through `gh` and reports whether the repo
has accumulated the current minimum of `3` successful shadow runs before any
limited non-release default judgment.

`pnpm check:ts7-decision-ready` is the current top-level judgment gate for the
TS 7 track. It requires both `Phase A decision-ready` and `Phase B readiness`
before any broader tsgo adoption or release-facing

judgment.

`TS 7 Phase C` is now opened. Its current scope is limited to long-lived and
workspace-edge behavior:
watch/incremental build behavior, long-lived LSP session behavior beyond the
one-shot smoke path, and multi-root/workspace-edge cases. It is not a wider
default flip.

`pnpm check:rust-checker-release-gate-shadow-review` is the current operator
review command for enforcement readiness. It reads recent
`Checker Release Gate Shadow` workflow history through `gh` and reports whether
the repo has accumulated the current minimum of `3` successful shadow runs that
were required before enforcement.

`pnpm check:rust-lane-bundle` is the broader Rust lane gate. It combines the
current semantic producer boundary checks, `pnpm check:rust-parser-public-product`,
and `pnpm check:rust-checker-entrance`.

`pnpm check:rust-release-bundle` is the release-facing Rust gate. It runs the
workspace hygiene pass, the current semantic producer boundary checks,
`pnpm check:rust-parser-public-product`, `pnpm check:rust-checker-entrance`,
and the current `rust-gate-evidence` measurement step.

`pnpm check:rust-split-boundaries` is the current operational check for the two
external Rust split repos. It is not part of the default stable release gate.
Run it when validating split-repo sync, remote-consumer viability, or split
boundary changes.

`V2` is the canonical live contract surface for release validation. Historical
`V1` parity commands remain available only to validate the frozen compatibility
view derived from `V2`.

Frozen V1 baseline commands remain available for historical validation only:

- `pnpm check:contract-parity-v1-smoke`
- `pnpm check:contract-parity-v1-golden`
- `pnpm update:contract-parity-v1-golden`

`pnpm check:release-batch` is the release-facing batch checker gate. It runs the
current `ci` preset against the curated clean corpus in
`scripts/release-batch-corpus.ts`. Use this instead of a repo-wide
`pnpm check:workspace -- . --preset ci` run because `examples/` intentionally
contains negative recovery fixtures that should not block a stable release.

For focused local review, prefer the changed-file presets:

```bash
pnpm check:workspace -- . --preset changed-source --changed-file src/App.tsx
pnpm check:workspace -- . --preset changed-style --changed-file src/Button.module.scss
```

Preset policy:

- `ci` => warning-only `ci-default` bundle
- `changed-source` => `source-missing` bundle with compact text output
- `changed-style` => `style-recovery` + `style-unused` bundles with compact text output

Treat `pnpm check:workspace -- . --preset ci` as the release-facing batch
checker command for full-repo operational review. It exercises the current CLI
preset policy instead of the raw default checker output, but it is not the
stable release gate while intentional negative fixtures live in the repo.

Use `pnpm check:workspace -- --list-bundles` to inspect the current named bundle map.

## Publish workflow

Publishing is done through the `Publish Extension` GitHub Actions workflow.

Inputs:

- `ref`
- `channel`
- `publish_marketplace`
- `publish_openvsx`
- `create_github_release`

The workflow:

1. checks out the requested ref
2. installs dependencies
3. runs `./scripts/publish-extension.sh`
4. packages the VSIX
5. publishes to Marketplace and/or Open VSX
6. optionally creates a GitHub release

## Stable release procedure

1. merge the release branch into `master`
2. run `Publish Extension`
3. use:
   - `ref=master`
   - `channel=stable`
   - `publish_marketplace=true`
   - `publish_openvsx=true` or `false`
   - `create_github_release=true`

## Preview release procedure

1. merge the target preview work into `next`
2. update the preview version
3. run `Publish Extension`
4. use:
   - `ref=next`
   - `channel=preview`
   - `publish_marketplace=true`
   - `publish_openvsx=false` or `true`
   - `create_github_release=true`

## Changesets

User-facing pull requests should include a changeset.

PRs that only touch:

- docs
- tests
- CI
- `examples/`

can use `changeset:skip`.

## Compatibility deprecations

Current path alias deprecation policy:

- legacy key: `cssModules.pathAlias`
- replacement key: `cssModuleExplainer.pathAlias`
- warning starts: `3.1.x`
- planned removal: `4.0.0`

When that compat path is removed, update:

- `server/engine-core-ts/src/settings.ts`
- `README.md`
- `package.json` configuration metadata
- changelog / release notes

## Local publish

```bash
pnpm release:publish
```

Environment variables used by the publish script:

- `RELEASE_CHANNEL=stable|preview`
- `PUBLISH_MARKETPLACE=true|false`
- `PUBLISH_OPENVSX=true|false`
- `VSCE_PAT`
- `OVSX_PAT`

The publish script also reads a repo-root `.env` file when present.
