# `engine-input-producers` split feasibility

Current status:

- strongest first split candidate under the current repository state
- current internal Rust producer boundary
- current crate path: `rust/crates/engine-input-producers`

This document answers the current-state split question only.

- It does not declare a public release plan.
- It does not resolve naming.
- It does not turn the split into an immediate roadmap commitment.

## Preferred extraction method

Preferred current method: `git subtree split`

Reasoning:

- preserves commit history for the crate path
- matches the earlier repo-level split direction that already favored history-preserving extraction
- keeps the decision narrow: extract the current crate boundary first, decide remote/naming later

Recommended command shape:

```bash
./scripts/prepare-engine-input-producers-subtree.sh split/engine-input-producers
```

Equivalent raw Git command:

```bash
git subtree split --prefix=rust/crates/engine-input-producers -b split/engine-input-producers
```

## What subtree split preserves

The extracted branch preserves history only for:

- `rust/crates/engine-input-producers/Cargo.toml`
- `rust/crates/engine-input-producers/README.md`
- `rust/crates/engine-input-producers/src/*`

This is enough to preserve the actual producer implementation history.

## What subtree split does not preserve automatically

The crate currently depends on repo-root Rust workspace settings:

- `rust/Cargo.toml`
  - workspace package metadata
  - workspace dependency versions
  - workspace lint policy
- `rust/rust-toolchain.toml`
- `rust/rustfmt.toml`

It also currently has an in-repo consumer:

- `rust/crates/engine-shadow-runner`

That means a subtree split branch is history-preserving, but not yet a standalone repo by itself.

## Minimum post-split scaffold for a standalone repo

If the subtree branch becomes a new repository, the new repo will still need:

1. a repo-root `Cargo.toml` or standalone crate `Cargo.toml` that no longer relies on workspace inheritance
2. `rust-toolchain.toml`
3. `rustfmt.toml`
4. lint policy equivalent to the current workspace lints
5. CI or equivalent check entry points for:
   - `cargo test`
   - formatting
   - clippy

## Current precondition assessment

Already in place:

- clear crate boundary
- crate README
- crate metadata (`description`, `repository`, `readme`)
- producer-boundary checks
- release-facing Rust bundle

Still deferred:

- split naming and repo convention
- standalone repo scaffold
- whether `engine-shadow-runner` remains a local in-repo consumer only or becomes a cross-repo consumer later

## Recommended interpretation

Under the current repository state:

- `engine-input-producers` is the strongest first split candidate
- `git subtree split` is the preferred first extraction method

Open follow-ups stay separate:

- `Q29.3` naming / repo convention
- `Q29.4` split preconditions beyond current boundary readiness
