# `omena-query`

Internal Rust crate for the Omena query boundary.

This crate owns the consumer-facing query surface that groups producer query
fragments with the abstract-value projection contract.

Current public products:

- `omena-query.boundary` — summary of the query boundary and delegated
  producer fragment surfaces.
- `omena-query.fragment-bundle` — grouped expression semantics, source
  resolution, and selector usage query fragments.
- `omena-query.selected-query-adapter-capabilities` — declared backend
  capability matrix and engine-shadow-runner command contract for the current
  selected-query adapter path.

Primary check:

```sh
pnpm cme-check run rust/omena-query/boundary
```
