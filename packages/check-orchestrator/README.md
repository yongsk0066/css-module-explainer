# Check Orchestrator

Internal Phase 1 gate inventory for CSS Module Explainer.

This package mirrors the existing root `package.json` scripts into typed gate
metadata without removing the old script names. The first live CLI surface is:

```sh
pnpm cme-check list
pnpm cme-check run check
pnpm cme-check bundle rust/release/bundle
pnpm cme-check doctor
```

Phase 1 intentionally keeps the old scripts as the executable source while the
manifest provides inventory, grouping, bundle introspection, and orphan checks.
