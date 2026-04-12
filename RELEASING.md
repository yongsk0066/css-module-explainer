# Releasing

## Branches

- `master`: stable releases
- `next`: preview releases

Stable and preview releases use numeric extension versions. Preview releases are
published with `--pre-release`.

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
