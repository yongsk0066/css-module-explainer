# `omena-bridge`

Internal Rust crate for CME-coupled bridge surfaces around Omena semantic graph
products.

`omena-semantic` still owns the generic semantic boundary and keeps legacy graph
entry points for compatibility. This crate is the new boundary for entry points
that combine generic style semantics with CSS Module Explainer source inputs
such as `EngineInputV2`.

Current public products:

- `omena-bridge.cme-semantic-bridge` — bridge boundary summary describing the
  CME-coupled surfaces that should move behind this crate.
- `omena-semantic.style-semantic-graph` — bridge-assembled graph product, kept
  stable for existing host consumers while graph assembly moves behind this
  crate.
- `omena-semantic.selector-references` — bridge-owned selector reference engine
  product, kept stable for existing host consumers while ownership moves behind
  this crate.
- `omena-semantic.source-input-evidence` — bridge-owned source evidence product,
  kept stable for existing host consumers while ownership moves behind this
  crate. The evidence includes value-domain derivation counts from the
  source-backed expression-semantics payload.
- `omena-semantic.promotion-evidence` — bridge-owned source-backed promotion
  evidence product, kept stable for existing host consumers while ownership
  moves behind this crate.

Primary check:

```sh
cargo test --manifest-path rust/Cargo.toml -p omena-bridge
```

Split boundary check:

```sh
pnpm cme-check bundle rust/omena-bridge/split-boundary
```
