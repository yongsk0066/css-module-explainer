# Changesets

This repository uses Changesets to record release intent on pull requests.

Each user-facing change should include a changeset unless it is one of:

- test-only changes
- internal refactors with no release impact
- CI or documentation-only updates

Versioning policy:

- `master` is the stable release line
- `next` is the preview release line
- VS Code Marketplace preview releases use numeric versions and
  `--pre-release`
- semver prerelease versions like `2.0.0-beta.1` are not used for the
  published extension package
