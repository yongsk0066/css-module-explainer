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

## Q29.4 current precondition call

Current recommendation:

- do **not** block a first subtree extraction on `engine-shadow-runner` dependency rewrites
- treat `engine-shadow-runner` as an internal consumer that can be adapted after extraction

Why:

- `engine-shadow-runner` is a dev-facing compare driver, not a shipped runtime surface
- the producer boundary already has its own crate docs, crate metadata, tests, and release-facing checks
- subtree extraction is about preserving and isolating producer history first, not finishing cross-repo consumption in one step

So the current precondition line is:

1. boundary must be stable
2. standalone scaffold requirements must be known
3. post-split consumer adaptation may remain follow-up work

That means the current split is blocked by missing standalone-repo scaffold only, not by `engine-shadow-runner` staying in the monorepo for now.

## Q29.4 consumer follow-up after extraction

If a subtree branch becomes a standalone repository later, the current in-repo consumer has three realistic follow-up paths:

1. keep `engine-shadow-runner` in this repo and switch to a Git dependency
2. keep `engine-shadow-runner` in this repo and temporarily vendor or mirror the crate source
3. move `engine-shadow-runner` into the extracted Rust repo later if the Rust workspace should stay co-located

Current recommendation:

- do not decide this before the first extraction
- extract the producer boundary first
- choose the consumer path once repo naming and ownership are fixed

## Q29.3 naming input

Current naming guidance:

- distinguish **repository naming** from **crate naming**
- do not force a crate rename just because repository branding may change

Repository-side inputs already observed:

- GitHub org: `omenien`
- npm scope: `@omena`
- VS Code publisher: `omena`

Current crate-side reality:

- crate name: `engine-input-producers`
- in-repo Rust convention: `engine-*`

Current recommendation:

1. first split discussion may use an `omena-*` repository name if desired
2. keep the Rust crate name `engine-input-producers` for the first extraction unless there is a stronger packaging reason to rename it

Why:

- the split question is already large enough without adding a cargo package rename
- keeping the crate name stable reduces migration noise for the current internal consumer
- repository branding can move independently from crate identity

## Practical next step

If `Q29.2` proceeds, the narrow next execution is:

1. create a local subtree branch with `./scripts/prepare-engine-input-producers-subtree.sh`
2. inspect the extracted branch contents
3. decide repository naming and ownership
4. add standalone Rust workspace scaffolding in the extracted branch or new repo

This keeps the first split decision mechanical and reversible.
