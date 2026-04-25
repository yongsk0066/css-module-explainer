# `omena-semantic`

Internal Rust crate for the style semantic boundary.

This crate is intentionally small: it consumes the parser boundary from
`engine-style-parser` and exposes semantic-facing summaries without moving the
parser implementation or changing existing parser consumers.

Primary check:

- `cargo test --manifest-path rust/Cargo.toml -p omena-semantic`
