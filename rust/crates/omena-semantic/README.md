# `omena-semantic`

Internal Rust crate for the style semantic boundary.

This crate is intentionally small: it consumes the parser boundary from
`engine-style-parser` and exposes semantic-facing summaries without moving the
parser implementation or changing existing parser consumers.

Current public products:

- `omena-semantic.selector-identity` — canonical selector ids, BEM suffix
  identity, and rewrite-safety blockers.
- `omena-semantic.promotion-evidence` — explicit readiness/gap checklist for
  promotion beyond output parity.
- `omena-semantic.lossless-cst-contract` — byte-span invariants used by precise
  rename, formatter, and recovery-oriented consumers.

Primary check:

- `cargo test --manifest-path rust/Cargo.toml -p omena-semantic`
