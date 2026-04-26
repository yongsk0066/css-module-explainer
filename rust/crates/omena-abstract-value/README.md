# `omena-abstract-value`

Internal Rust crate for the Omena abstract class-value domain.

This crate owns the generic domain contract used to reason about dynamic class
values before they are projected into a selector universe.

Current public product:

- `omena-abstract-value.domain` — domain boundary summary for the abstract
  class-value lattice and selector projection certainty contract.

Primary check:

```sh
cargo test --manifest-path rust/Cargo.toml -p omena-abstract-value
```
