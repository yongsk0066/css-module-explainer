# `engine-style-parser`

Internal Rust crate for the parser/public-product track.

Current scope:

- style-language detection for `.module.css`, `.module.scss`, `.module.less`
- byte-span tokenization
- shallow stylesheet parsing into rule / at-rule / declaration / comment nodes
  with structured prelude / header / value payloads
- parser diagnostics for unterminated comments, strings, and blocks
- bounded Rust-vs-TS parity and CSS Modules intermediate producer binaries
- parser canonical-candidate / canonical-producer artifacts over those bounded outputs
- Sass symbol seed facts in the CSS Modules intermediate producer for variables,
  mixins, functions, static `@use` / `@forward` / `@import` module edges, and
  `@use` namespace seeds
- same-file Sass resolution seeds for variables, mixin includes, and declared
  function calls

Non-goals in this first scaffold:

- no TS/runtime integration yet
- no public package commitment
- no provider-facing Sass symbol feature yet
- no cross-file Sass module resolution yet

Primary check:

- `cargo test --manifest-path rust/Cargo.toml -p engine-style-parser`
- `pnpm check:rust-parser-css-modules-intermediate`
- `pnpm check:rust-parser-index-producer`
- `pnpm check:rust-parser-canonical-candidate`
- `pnpm check:rust-parser-evaluator-candidates`
- `pnpm check:rust-parser-canonical-producer`
- `pnpm check:rust-parser-consumer-boundary`
- `pnpm check:rust-parser-lane`
- `pnpm check:rust-parser-public-product`

This crate is intentionally internal. `publish = false` remains in effect at the workspace level.
