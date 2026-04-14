# Releasing

## Branches

- `master`: stable releases
- `next`: preview releases

Stable and preview releases use numeric extension versions. Preview releases are
published with `--pre-release`.

## Pre-release rules

VS Code Marketplace pre-release publishing has two hard constraints:

1. publish with `vsce package --pre-release` / `vsce publish --pre-release`
2. keep extension versions in plain `major.minor.patch` form

Do not use versions such as `3.0.0-alpha.1` or `3.0.0-beta.2`. Marketplace
does not support semver pre-release tags for extension versions.

Versions must also stay distinct across channels. If `3.1.0` is published as a
pre-release, the next stable release cannot reuse `3.1.0`.

Official guidance:

- VS Code Marketplace pre-release docs:
  https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions

## 3.0 alpha plan

For the 3.0 architecture rollout:

- keep `master` on stable `2.x`
- publish alpha builds from `next`
- use numeric preview versions on `next`
- publish Marketplace previews with `channel=preview`

Recommended version policy:

- `master`: stable line
  - current stable remains `2.x`
  - final cutover can ship as `3.0.0`
- `next`: preview line
  - use `3.1.x` for `3.0` alpha and beta builds
  - publish every preview with `--pre-release`

This keeps the final stable `3.0.0` available while still following the VS Code
pre-release versioning rules.

Open VSX is different. Its publishing guide documents packaging and upload, but
does not document a Marketplace-style pre-release channel. Treat Open VSX as a
secondary distribution target for alpha builds, not as the authoritative
preview channel.

Official Open VSX publishing guide:

- https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions

## Release planning

User-facing pull requests should include a changeset.

PRs that only touch CI, docs, tests, or `examples/` can use the
`changeset:skip` label.

On `master`, the release-plan workflow opens or updates a release pull request
that applies pending changesets and updates the changelog.

## Manual publish

Publishing is done through the `Publish Extension` GitHub Actions workflow.

Inputs:

- `ref`: branch or tag to publish
- `channel`: `stable` or `preview`
- `publish_marketplace`
- `publish_openvsx`
- `create_github_release`

This workflow:

1. syncs `SERVER_VERSION` from `package.json`
2. runs `pnpm check`
3. runs `pnpm test`
4. runs the extension-host smoke test in CI
5. builds and packages the extension
6. publishes to VS Code Marketplace and/or Open VSX
7. optionally creates a GitHub release

For a 3.0 alpha release:

1. merge the target changes into `next`
2. bump `next` to the next preview version, for example `3.1.0`
3. run `Publish Extension`
4. set:
   - `ref=next`
   - `channel=preview`
   - `publish_marketplace=true`
   - `publish_openvsx=false` or `true` depending on whether you want a secondary package upload
   - `create_github_release=true`

## Local verification

```bash
pnpm install
pnpm release:verify
pnpm release:publish
```

Environment variables used by the publish script:

- `RELEASE_CHANNEL=stable|preview`
- `PUBLISH_MARKETPLACE=true|false`
- `PUBLISH_OPENVSX=true|false`
- `VSCE_PAT`
- `OVSX_PAT`

For local publishing, you can also place `VSCE_PAT` and `OVSX_PAT` in a repo
root `.env` file. The publish script loads it automatically when present.

Example:

```bash
VSCE_PAT=...
OVSX_PAT=...
```
