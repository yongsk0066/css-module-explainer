# `engine-style-parser`

Internal Rust crate for the parser/public-product track.

Current scope:

- style-language detection for `.module.css`, `.module.scss`, `.module.less`
- byte-span tokenization
- shallow stylesheet parsing into rule / at-rule / declaration / comment nodes
  with structured prelude / header / value payloads
- parser diagnostics for unterminated comments, strings, and blocks
- indexing-fact producer binaries for bounded Rust-vs-TS bridge checks

Non-goals in this first scaffold:

- no selector semantics
- no CSS Modules indexing
- no TS/runtime integration yet
- no public package commitment

Primary check:

- `cargo test --manifest-path rust/Cargo.toml -p engine-style-parser`
- `pnpm check:rust-parser-index-producer`

This crate is intentionally internal. `publish = false` remains in effect at the workspace level.
