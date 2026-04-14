# 3.0 Alpha Release Plan

This document defines the release stance for the 3.0 architecture line.

## Scope

The 3.0 alpha line exists to validate the new runtime architecture in real
projects before stable cutover.

It is not the place to widen product scope. In particular:

- include architecture fixes and correctness fixes needed by the new runtime
- include issue `#9`
- do not include issue `#10`

Issue `#10` requires a separate token/design-symbol subsystem and should stay
post-3.0.

## Current 3.0 readiness

The new runtime architecture is already in place on the `v3/binder-foundation`
line:

- scoped binding layer
- abstract class-value domain
- provider-facing read models
- generic rewrite planning
- runtime cutover away from the old semantic-graph-first path

Remaining work before alpha should focus on:

- documentation alignment
- remaining polish issues
- integration and manual QA

## Compatibility review

### Architectural compatibility

Old runtime compatibility layers are already gone. The remaining compatibility
surface is configuration-level only.

### `cssModules.pathAlias`

Current state:

- the runtime supports `tsconfig.json` / `jsconfig.json` `compilerOptions.paths`
- it also reads `cssModules.pathAlias` as a compatibility input

Assessment:

- removing `cssModules.pathAlias` is technically easy
- removing it before alpha has low architectural value and high migration cost
- this setting does not reintroduce an old competing runtime architecture

Decision for alpha:

- keep reading `cssModules.pathAlias`
- document it as compatibility-only
- do not expand it into more compatibility behavior

Decision point for post-alpha:

- either keep it indefinitely as a low-cost migration shim
- or introduce a native `cssModuleExplainer.pathAlias` key and deprecate the old
  key in a later release

This is not a blocker for 3.0 alpha.

## Versioning policy

VS Code Marketplace pre-release publishing does not support semver pre-release
version strings such as `3.0.0-alpha.1`.

Use:

- numeric versions only
- `vsce publish --pre-release`

Recommended channel policy:

- `master`: stable line
- `next`: preview line

Recommended version policy for the 3.0 rollout:

- stable final target: `3.0.0`
- alpha/beta preview line: `3.1.x`

Examples:

- `3.1.0` pre-release: alpha 1
- `3.1.1` pre-release: alpha 2
- `3.1.2` pre-release: beta 1
- `3.0.0` stable: final cutover

This keeps the stable `3.0.0` version available while still following the
Marketplace pre-release rules.

## Channel policy

### VS Code Marketplace

This is the authoritative alpha channel.

Required:

- package with `--pre-release`
- publish with `--pre-release`

### Open VSX

Open VSX publishes packaged extensions, but its official guide does not define a
Marketplace-style pre-release channel. Treat it as optional secondary
distribution for alpha builds.

Recommended alpha stance:

- Marketplace: yes
- Open VSX: optional

## Operational plan

### Alpha 1 gate

Before `3.1.0` pre-release:

1. `pnpm check`
2. `pnpm test`
3. `pnpm test:extension-host`
4. manual QA in `examples/`
5. manual QA in one real project
6. README and release docs aligned

### Alpha publish flow

1. merge the target 3.0 commits into `next`
2. apply a changeset for the preview version bump
3. version `next` to `3.1.0`
4. run the `Publish Extension` workflow with:
   - `ref=next`
   - `channel=preview`
   - `publish_marketplace=true`
   - `publish_openvsx=false` or `true`
   - `create_github_release=true`
5. verify install/update behavior in VS Code

### Stable cutover gate

Before `3.0.0` stable:

1. alpha issues triaged
2. no remaining architecture cutover blockers
3. docs and migration notes complete
4. release branch or merge plan from `next` to `master` decided

## Risks

- preview users follow the highest numeric version, so version discipline
  matters
- Open VSX preview semantics are not documented the same way as Marketplace
- removing config compatibility too early creates migration churn without
  architectural payoff

## Sources

- VS Code Marketplace publishing:
  https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions
- Open VSX publishing:
  https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions
