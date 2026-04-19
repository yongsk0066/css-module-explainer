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
pnpm test:extension-host
pnpm check:rust-workspace
pnpm check:rust-gate-evidence -- --variant typescript-current --repeat 1 --json
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
3. run `pnpm check:rust-workspace`
4. run `pnpm check:rust-gate-evidence -- --variant typescript-current --repeat 1 --json`
5. run `pnpm test`
6. run `pnpm build`

`pnpm check:semantic-smoke` is the canonical semantic smoke pass. It is not the
release gate yet. It gives one repeatable workspace/checker sanity check before
packaging.

The smoke corpus is defined in `scripts/semantic-smoke-corpus.ts`. Treat that
file as the release-facing semantic fixture list. Update it when a new semantic
surface becomes release-relevant.

`pnpm check:contract-parity-v2-smoke` verifies that the canonical engine
contracts can still be assembled across the parity corpus.

`pnpm check:contract-parity-v2-golden` verifies the normalized
`EngineInputV2` / `EngineOutputV2` golden fixtures under
`test/_fixtures/contract-parity-v2/`.

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
