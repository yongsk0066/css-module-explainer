# Check Orchestrator

Internal gate inventory and runner for CSS Module Explainer.

This package mirrors the existing root `package.json` scripts into typed gate
metadata without removing the old script names. CI and release verification can
route through the manifest-backed CLI while the legacy script names stay valid:

```sh
pnpm cme-check list
pnpm cme-check run core/check
pnpm cme-check bundle rust/release/bundle
pnpm cme-check bundle tsgo/release/bundle
pnpm cme-check bundle release/release/verify
pnpm cme-check plan release/release/verify
pnpm cme-check doctor
pnpm cme-check inventory --check
```

The root scripts remain the executable source of truth. Aggregate root scripts
should depend on canonical `cme-check` gate IDs instead of chaining legacy
`check:*` script names directly. The orchestrator layer provides stable gate IDs,
grouping, bundle introspection, argument forwarding, execution plans, and doctor
checks so workflows do not need to duplicate every script name.
`doctor` also rejects GitHub workflow calls that bypass `cme-check` for
manifest-covered package scripts, non-canonical or unknown `cme-check` targets,
and `bundle` calls pointed at non-bundle gates.

`CHECKS.md` is generated from the manifest. Update it with
`pnpm cme-check inventory --write` after adding, renaming, or regrouping check
scripts.
