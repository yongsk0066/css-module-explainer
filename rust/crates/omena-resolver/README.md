# `omena-resolver`

Internal Rust crate for the Omena source-resolution boundary.

This crate is the first extraction point for resolver-owned source-resolution
surfaces. It keeps the existing `engine-input-producers` output contracts stable
while giving downstream crates a resolver-facing API to consume.

Current public products:

- `omena-resolver.boundary` — summary of the resolver boundary, delegated
  source-resolution products, and remaining CME-coupled surfaces.
- `omena-resolver.module-graph-index` — resolver-owned module graph index over
  style module paths, source expressions, type facts, and selector names.
- `omena-resolver.runtime-query-boundary` — module graph backed runtime/query
  boundary for style-path module lookup and edge lookup readiness.
- source-resolution query fragment wrapper for the existing
  `engine-input-producers.source-resolution-query-fragments` product.
- source-resolution canonical producer wrapper for the existing
  `engine-input-producers.source-resolution-canonical-producer` product.

Primary check:

```sh
pnpm cme-check run rust/omena-resolver/boundary
```
