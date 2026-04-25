# `omena-semantic`

Internal Rust crate for the style semantic boundary.

This crate is intentionally small: it consumes the parser boundary from
`engine-style-parser` and exposes semantic-facing summaries without moving the
parser implementation or changing existing parser consumers.

Current public products:

- `omena-semantic.style-semantic-graph` — combined parser boundary,
  selector-identity, source-input evidence, promotion evidence, and lossless
  CST contract for semantic graph consumers.
- `omena-semantic.selector-identity` — canonical selector ids, BEM suffix
  identity, and rewrite-safety blockers.
- `omena-semantic.promotion-evidence` — explicit readiness/gap checklist for
  promotion beyond output parity.
- `omena-semantic.source-input-evidence` — `EngineInputV2`-backed reference
  site identity, binding origin, style module edge, value-domain explanation,
  and selector certainty reason evidence.
- `omena-semantic.lossless-cst-contract` — byte-span invariants used by precise
  rename, formatter, and recovery-oriented consumers.

Primary check:

- `cargo test --manifest-path rust/Cargo.toml -p omena-semantic`

CLI smoke:

```sh
printf '.button { &__icon {} }' \
  | cargo run --manifest-path rust/Cargo.toml -p omena-semantic --bin omena-semantic-boundary -- Component.module.scss
```

For `EngineInputV2` source-side evidence:

```sh
cat engine-input-v2.json \
  | cargo run --manifest-path rust/Cargo.toml -p omena-semantic --bin omena-semantic-source-evidence
```

For the combined style semantic graph product:

```sh
cat style-semantic-graph-input.json \
  | cargo run --manifest-path rust/Cargo.toml -p omena-semantic --bin omena-semantic-graph
```
