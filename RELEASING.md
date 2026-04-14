# Releasing

This document defines the current release process.

It is an operations document, not a rollout diary.

## Branches

- `master`: stable releases
- `next`: preview releases

## Versioning Rules

Stable and preview releases both use numeric extension versions.

Use:

- `3.2.0`
- `3.2.1`
- `3.3.0`

Do not use:

- `3.2.0-alpha.1`
- `3.2.0-beta.1`

VS Code Marketplace pre-release publishing requires:

1. numeric `major.minor.patch` versions
2. `--pre-release` packaging/publishing for preview builds

Stable and preview versions must stay distinct. If a version has already been
used for a preview publish, the next stable release must use a different
version number.

Reference:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions

## Channels

### Stable

- branch: `master`
- workflow input: `channel=stable`
- publishes a normal Marketplace release

### Preview

- branch: `next`
- workflow input: `channel=preview`
- publishes a Marketplace pre-release

Open VSX does not document Marketplace-style preview behavior in the same way.
Treat preview publishing there as optional.

Reference:

- https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions

## Release Planning

User-facing pull requests should include a changeset.

PRs that only touch docs, tests, CI, or `examples/` can use:

- `changeset:skip`

On `master`, the release-plan workflow prepares version/changelog updates from
pending changesets.

## Verification

Before a release:

```bash
pnpm install
pnpm release:verify
pnpm test:extension-host
pnpm --dir examples exec tsc -p tsconfig.json --noEmit
pnpm --dir examples build
pnpm exec vsce package --no-dependencies
```

`pnpm release:verify` does:

1. sync `SERVER_VERSION`
2. run `pnpm check`
3. run `pnpm test`
4. run `pnpm build`

## Publish Workflow

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

## Stable Release Procedure

1. merge the target release branch into `master`
2. run `Publish Extension`
3. set:
   - `ref=master`
   - `channel=stable`
   - `publish_marketplace=true`
   - `publish_openvsx=true` or `false`
   - `create_github_release=true`

## Preview Release Procedure

1. merge the target preview work into `next`
2. bump `next` to the preview version
3. run `Publish Extension`
4. set:
   - `ref=next`
   - `channel=preview`
   - `publish_marketplace=true`
   - `publish_openvsx=false` or `true`
   - `create_github_release=true`

## Compatibility Deprecations

Current path-alias deprecation policy:

- legacy key: `cssModules.pathAlias`
- replacement key: `cssModuleExplainer.pathAlias`
- warning starts: `3.1.x`
- planned removal: `4.0.0`

Removal must update:

- `server/src/settings.ts`
- `README.md`
- `package.json` configuration metadata
- changelog / release notes

## Local Publish

```bash
pnpm release:publish
```

Environment variables used by the publish script:

- `RELEASE_CHANNEL=stable|preview`
- `PUBLISH_MARKETPLACE=true|false`
- `PUBLISH_OPENVSX=true|false`
- `VSCE_PAT`
- `OVSX_PAT`

The publish script also loads a repo-root `.env` file when present.
