# Architecture

This document describes the current runtime architecture.

It focuses on four questions:

1. what problem the project is solving
2. why the previous structure was not enough
3. what the current layers are
4. what this structure buys us

This is not a rollout log or a planning document. It is a description of the
current system.

## Problem

The hard part of this project is not parsing CSS Modules. The hard part is
making all editor features answer the same semantic questions consistently.

The runtime has to answer questions such as:

- what does `cx(...)` refer to here
- what does `styles.foo` or `styles["foo-bar"]` refer to here
- what selector is introduced by a nested style rule
- what values can a dynamic class expression produce
- which selectors are used, unused, safe to rename, or unsafe to rewrite

These questions cut across source files, style files, dynamic expressions,
workspace indexing, and editor transport.

## Why the earlier structure was not enough

The earlier structure had HIR documents, but the semantic work above them was
still too distributed.

In practice that meant:

- multiple parts of the system re-derived binding and selector meaning
- source-side resolution still relied on weak heuristics in some places
- dynamic class reasoning was split across separate paths
- providers were too aware of low-level semantic details

The result was functional, but hard to reason about. Feature behavior could
drift because hover, diagnostics, references, and rename were not all reading
the same semantic contract.

The 3.x architecture was designed to fix that. The goal was not to add more
layers for their own sake. The goal was to make each semantic question belong
to exactly one place.

## Current structure

```text
source/style text
  -> document facts
  -> source binding
  -> abstract class-value analysis
  -> read models
  -> provider / rewrite policy
  -> LSP
```

At a higher level:

```text
Source AST -> SourceDocumentHIR ----\
                                     -> Binding Graph
Style AST  -> StyleDocumentHIR -----/        |
                                              v
                                     Abstract Value Layer
                                              |
                                              v
                                         Read Models
                                              |
                                              v
                                   Provider / Rewrite Policy
                                              |
                                              v
                                      LSP + Runtime Wiring
```

The important design choice is that source and style do not collapse into one
monolithic model. Source and style keep their own fact layers. Binding,
dynamic-value reasoning, and provider-facing summaries sit above those fact
layers.

## 1. Document facts

Document facts live in:

- `server/src/core/hir/source-types.ts`
- `server/src/core/hir/style-types.ts`

`SourceDocumentHIR` owns:

- class expressions
- style imports
- utility binding facts
- source ranges

`StyleDocumentHIR` owns:

- selector identity
- canonical and view names
- selector ranges
- nested metadata
- BEM suffix metadata
- `composes` facts
- `@keyframes` declarations and animation-name references
- `@value` declarations, imports, and references

These types preserve what exists in the document. They do not decide:

- what a source symbol binds to
- what a dynamic class expression can evaluate to
- whether a rewrite is allowed

That separation matters. HIR is a fact layer, not a semantic policy layer.

## 2. Source binding

Source-side name resolution lives in:

- `server/src/core/binder/binder-builder.ts`
- `server/src/core/binder/source-binding-graph.ts`

This layer owns:

- file / function / block scopes
- declarations and references
- import, local, and parameter shadowing
- call-site-aware lookup

This is the authoritative source for questions such as:

- which `cx` helper is in scope here
- which `styles` import is in scope here
- which declaration wins when names are shadowed

Before this layer existed, some of that logic leaked into providers and helper
code. Now it has one owner.

Benefits:

- source-side resolution is consistent across features
- shadowing bugs can be fixed in one place
- completion, hover, and definition share the same binding result

## 3. Abstract value analysis

Dynamic class reasoning lives in:

- `server/src/core/abstract-value/class-value-domain.ts`
- `server/src/core/abstract-value/selector-projection.ts`

The point of this layer is not to compute exact runtime values in all cases. The
point is to model dynamic class values with one shared domain.

The current domain includes:

- `exact`
- `finiteSet`
- `prefix`
- `top`
- `bottom`

This lets the runtime represent:

- local flow branches
- string-literal unions
- template and concatenation patterns
- non-finite dynamic cases

Earlier versions treated template cases, flow cases, and union cases through
separate logic. Now they share one value model.

Benefits:

- certainty is derived from one semantic basis
- hover and diagnostics read the same dynamic semantics
- new dynamic cases usually land in the domain and projection code, not in each provider

## 4. Read models

Read models live under:

- `server/src/core/query/*`
- `server/src/core/rewrite/*`

Examples:

- `read-source-expression-resolution.ts`
- `read-expression-semantics.ts`
- `read-selector-usage.ts`
- `read-style-module-usage.ts`
- `read-selector-rewrite-safety.ts`
- `read-style-rewrite-policy.ts`

The checker is a second consumer of the same semantic contracts:

- `server/src/core/checker/*`

Read models turn low-level semantic state into stable summaries that providers
can consume directly.

They answer questions such as:

- what selectors this expression can resolve to
- how certain that resolution is
- how a selector is used across the workspace
- whether a selector is safe to rewrite

This is the main place where the architecture became simpler. Providers no
longer need to assemble semantic meaning from binder, stores, and abstract
value internals.

Benefits:

- providers get thinner
- feature behavior is more consistent
- semantic changes can be made below the provider layer
- non-editor consumers can reuse the same semantic contracts

## 5. Rewrite and provider policy

Rewrite logic and providers sit above read models.

Rewrite entrypoints:

- `server/src/core/rewrite/selector-rename.ts`
- `server/src/core/rewrite/text-rewrite-plan.ts`

Provider entrypoints:

- `server/src/providers/*`

Responsibilities are split like this:

- core rewrite code decides whether a rewrite is legal and what edits it implies
- providers convert that result into LSP shapes such as `WorkspaceEdit`, `Hover`,
  `CodeLens`, and diagnostics

Providers should not:

- resolve bindings ad hoc
- rerun selector projection logic
- invent certainty policy
- interpret raw style safety metadata directly

Benefits:

- rewrite legality is not coupled to LSP edit shaping
- semantic policy can be reused across surfaces
- provider code is easier to review and test

## 6. Semantic storage

Workspace-level semantic storage is split into separate responsibilities.

- `server/src/core/semantic/reference-collector.ts`
- `server/src/core/semantic/workspace-reference-index.ts`
- `server/src/core/semantic/reference-dependencies.ts`
- `server/src/core/semantic/style-dependency-graph.ts`

Roles:

- collector
  - derives semantic contributions from analysis results
- reference store
  - stores selector reference sites and module usage data
- dependency store
  - stores reverse lookup data for invalidation
- style dependency graph
  - stores `composes` relationships

This storage also feeds token-style features that are not selector-only, such
as `@value` and same-file `@keyframes` recovery.

This split exists because query, indexing, and invalidation do not need the same
data structure, even if they are all fed by the same analysis results.

The store is incremental. It updates contribution by contribution instead of
rebuilding whole derived maps for every change.

Benefits:

- lower steady-state update cost
- cleaner invalidation boundaries
- better support for style dependencies such as `composes`

## 7. Workspace runtime

Workspace runtime is explicit and workspace-root scoped.

- `server/src/workspace/workspace-registry.ts`
- `server/src/runtime/shared-runtime-caches.ts`
- `server/src/runtime/workspace-runtime.ts`
- `server/src/runtime/workspace-runtime-settings.ts`
- `server/src/runtime/workspace-analysis-runtime.ts`
- `server/src/runtime/workspace-style-runtime.ts`

Current split:

- shared runtime caches
  - process-wide cache objects
- workspace runtime settings
  - normalized resource settings and alias resolver state
- workspace analysis runtime
  - analysis cache and semantic contribution ingestion
- workspace style runtime
  - style indexing, style cache, style dependency graph
- workspace runtime
  - orchestration for one workspace root
- workspace registry
  - file-to-workspace ownership and routing

`server/adapter-vscode/src/composition-root.ts` is the top-level assembly point. Its job is
orchestration, not feature logic.

Benefits:

- multi-root behavior is explicit
- workspace-specific concerns are isolated
- runtime assembly is easier to reason about than one large composition blob

## 8. Invalidation

Invalidation is modeled as explicit runtime contracts.

- `server/src/runtime/dependency-snapshot.ts`
- `server/src/runtime/watched-file-changes.ts`
- `server/src/runtime/invalidation-planner.ts`

The flow is:

1. capture a dependency snapshot
2. classify settings changes or watched-file changes
3. compute an invalidation plan
4. apply the plan from handler/runtime wiring

`server/adapter-vscode/src/handler-registration.ts` applies plans. It should not own semantic
diffing rules itself.

Benefits:

- invalidation logic is testable in isolation
- source dependencies, style dependencies, and settings dependencies follow the same model
- runtime behavior is easier to extend without scattering feature-specific invalidation code

## 9. Transport boundary

Runtime code does not directly depend on incidental LSP transport effects.

- `server/src/runtime/runtime-sink.ts`

The sink covers:

- info / error logging
- diagnostics clearing
- CodeLens refresh requests

`composition-root.ts` binds that interface to the actual LSP connection.

Benefits:

- runtime orchestration stays transport-agnostic
- transport concerns stay at the edge
- future non-LSP consumers are easier to imagine without rewriting runtime internals

## 10. Dependency direction

The codebase is kept package-ready even though it still ships as one extension.

Allowed direction:

```text
providers
  -> core/query
  -> core/rewrite
  -> core/*

runtime
  -> core/*

core/*
  -> core/*
```

Disallowed direction:

```text
core/* -> providers/*
core/* -> runtime/*
runtime/* -> providers/provider-deps
runtime/* -> vscode-languageserver*
providers/* -> deep core/query/* or core/rewrite/*
```

Current façade boundaries:

- `server/src/core/query/index.ts`
- `server/src/core/rewrite/index.ts`
- `server/src/core/semantic/index.ts`
- `server/src/runtime/index.ts`

This does not force a package split today. It keeps that option mechanically
possible later.

## What this architecture gives us

The main gain is not elegance for its own sake. The main gain is that semantic
behavior can be explained and changed one layer at a time.

When a feature is wrong, the first question is now clearer:

- is the problem in document facts
- source binding
- abstract value analysis
- read models
- semantic storage
- runtime invalidation
- provider shaping

That was much harder when multiple layers were recomputing meaning in parallel.

In practical terms, the current structure gives us:

- more consistent behavior across hover, definition, references, rename, completion, and diagnostics
- fewer provider-local heuristics
- better support for multi-root workspaces and `composes`
- checker and batch-consumer entrypoints that reuse the same semantic pipeline
- token-level style semantics for `@value` and first-pass `@keyframes`
- clearer invalidation behavior
- a codebase that is easier to extend without reopening old architectural shortcuts

Current intentional limits:

- `@keyframes` validation and navigation are same-file first pass only
- `@value` covers local declarations and imported bindings between style modules
- token semantics follow the same layer boundaries as selector semantics; they do not add a parallel semantic path

## Rules that should remain true

- HIR stays a fact layer
- source-side resolution stays in the binder layer
- dynamic class reasoning stays in the abstract value layer
- providers consume read models instead of rebuilding semantic meaning
- rewrite legality is decided in core rewrite code
- invalidation is explained through runtime contracts
- transport-specific behavior stays at the transport edge

If a new feature cannot be placed cleanly under those rules, it is usually a
sign that the wrong layer is being asked to solve it.
