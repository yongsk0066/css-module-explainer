# `omena-bridge`

Internal Rust crate for CME-coupled bridge surfaces around Omena semantic graph
products.

`omena-semantic` still owns the current style semantic graph product for
compatibility. This crate is the new boundary for entry points that combine
generic style semantics with CSS Module Explainer source inputs such as
`EngineInputV2`.

Current public products:

- `omena-bridge.cme-semantic-bridge` — bridge boundary summary describing the
  CME-coupled surfaces that should move behind this crate.
- `omena-semantic.style-semantic-graph` — delegated graph product, kept stable
  for existing host consumers while the bridge boundary is introduced.
- `omena-semantic.source-input-evidence` — delegated source evidence product
  derived from `EngineInputV2`.

Primary check:

```sh
cargo test --manifest-path rust/Cargo.toml -p omena-bridge
```
