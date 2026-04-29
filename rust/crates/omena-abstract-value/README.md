# `omena-abstract-value`

Internal Rust crate for the Omena abstract class-value domain.

This crate owns the generic domain contract used to reason about dynamic class
values before they are projected into a selector universe.

Current public product:

- `omena-abstract-value.domain` — domain boundary summary for the abstract
  class-value lattice and selector projection certainty contract.
- `intersect_abstract_class_values` — reduced-product intersection over finite,
  prefix, suffix, character-inclusion, and composite class-value domains.
- `join_abstract_class_values` — least-upper-bound merge for branch-sensitive
  class-value flow.
- `analyze_class_value_flow` — V0 1-CFA flow analysis over explicit
  class-value flow graphs with assign/refine/join transfers.
- `reduced_abstract_class_value_from_facts` /
  `reduced_value_domain_kind_from_facts` — source fact reduction before
  evaluator-facing domain-kind reporting.

Primary check:

```sh
cargo test --manifest-path rust/Cargo.toml -p omena-abstract-value
```

Split boundary check:

```sh
pnpm cme-check bundle rust/omena-abstract-value/split-boundary
```
