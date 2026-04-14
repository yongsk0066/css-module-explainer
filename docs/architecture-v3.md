# Architecture

This document describes the current runtime structure of the extension.

The system is built around one semantic pipeline:

```text
source/style text
  -> document facts
  -> source binding
  -> abstract class-value analysis
  -> read models
  -> provider / rewrite policy
  -> LSP
```

The main design goals are:

- one semantic pipeline for hover, definition, references, rename, completion, and diagnostics
- clear ownership between parsing, binding, value analysis, query, runtime, and transport
- runtime contracts that can evolve without reintroducing provider-local heuristics

## 1. High-Level Structure

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

The extension has six major parts:

1. document facts
2. source binding
3. abstract value analysis
4. read models
5. rewrite and provider policy
6. workspace runtime and transport wiring

## 2. Document Facts

Document facts are the source-preserving parse products.

- `server/src/core/hir/source-types.ts`
- `server/src/core/hir/style-types.ts`

`SourceDocumentHIR` owns:

- class expressions
- style imports
- utility bindings
- source ranges and source text identity

`StyleDocumentHIR` owns:

- selector identity
- canonical and view names
- selector ranges
- nested metadata
- BEM suffix metadata
- `composes` facts

These types describe what exists in the document. They do not decide:

- which symbol a source reference binds to
- what a dynamic class expression can evaluate to
- whether a rewrite is allowed

## 3. Source Binding

Source-side name resolution is handled by the binder layer.

- `server/src/core/binder/binder-builder.ts`
- `server/src/core/binder/source-binding-graph.ts`

This layer owns:

- file / function / block scopes
- declarations and references
- import and local binding identity
- shadowing
- call-site-aware lookup

This is the authoritative source for resolving:

- `cx`
- `styles`
- imported helper symbols
- local variables and parameters

Providers do not infer scope from line ranges or document order.

## 4. Abstract Value Analysis

Dynamic class reasoning is handled by the abstract value layer.

- `server/src/core/abstract-value/class-value-domain.ts`
- `server/src/core/abstract-value/selector-projection.ts`

The domain models class values as:

- `exact`
- `finiteSet`
- `prefix`
- `top`
- `bottom`

This layer is responsible for lifting:

- local flow
- branch joins
- TypeScript string-literal unions
- template and concatenation patterns

The output of this layer is not LSP-facing text. It is semantic state used by
read models.

## 5. Read Models

Read models convert core semantic state into stable, provider-facing summaries.

- `server/src/core/query/index.ts`
- `server/src/core/rewrite/index.ts`

Representative modules:

- `read-source-expression-resolution.ts`
- `read-expression-semantics.ts`
- `read-selector-usage.ts`
- `read-style-module-usage.ts`
- `read-selector-rewrite-safety.ts`
- `read-style-rewrite-policy.ts`

These summaries answer questions such as:

- what selector candidates does this expression project to
- how certain is that projection
- how is a selector used across the workspace
- is a selector safe to rewrite

Providers are expected to consume these summaries rather than walking binder,
semantic store, or abstract-value internals directly.

## 6. Rewrite and Provider Policy

Rewrite and provider policy sit on top of read models.

Rewrite entrypoints:

- `server/src/core/rewrite/selector-rename.ts`
- `server/src/core/rewrite/text-rewrite-plan.ts`

Provider entrypoints:

- `server/src/providers/*`

Responsibilities are split like this:

- core rewrite code decides whether a rewrite is legal and what edits it implies
- providers adapt that result to LSP shapes such as `WorkspaceEdit`, `Hover`, `CodeLens`, and diagnostics

Providers should not:

- resolve bindings ad hoc
- re-run selector projection logic
- invent certainty rules
- inspect raw style safety metadata directly

## 7. Semantic Storage

Workspace-level semantic storage is split into collection, storage, and
dependency lookup.

- `server/src/core/semantic/reference-collector.ts`
- `server/src/core/semantic/workspace-reference-index.ts`
- `server/src/core/semantic/reference-dependencies.ts`
- `server/src/core/semantic/style-dependency-graph.ts`

Responsibilities:

- collector
  - derives semantic contributions from analysis results
- reference store
  - stores selector reference sites and module usage data
- dependency store
  - stores reverse-lookup data for invalidation
- style dependency graph
  - stores `composes` reachability between style selectors and modules

The store is incremental. It updates contribution-by-contribution instead of
rebuilding whole derived maps on every change.

## 8. Workspace Runtime

Workspace runtime is explicit and workspace-root scoped.

- `server/src/runtime/shared-runtime-caches.ts`
- `server/src/runtime/workspace-runtime.ts`
- `server/src/runtime/workspace-runtime-settings.ts`
- `server/src/runtime/workspace-analysis-runtime.ts`
- `server/src/runtime/workspace-style-runtime.ts`
- `server/src/workspace/workspace-registry.ts`

The split is:

- shared runtime caches
  - process-wide caches shared across workspace runtimes
- workspace runtime settings
  - normalized resource settings and alias resolver state
- workspace analysis runtime
  - analysis cache and semantic contribution ingestion
- workspace style runtime
  - style indexing, style cache, and style dependency graph coordination
- workspace runtime
  - orchestration for one workspace root
- workspace registry
  - file-to-workspace ownership and dependency routing

`server/src/composition-root.ts` is the top-level assembly point. It should stay
as orchestration code, not feature logic.

## 9. Invalidation

Invalidation is modeled as explicit runtime contracts.

- `server/src/runtime/dependency-snapshot.ts`
- `server/src/runtime/watched-file-changes.ts`
- `server/src/runtime/invalidation-planner.ts`

The flow is:

1. capture a dependency snapshot
2. classify settings changes or watched-file changes
3. compute an invalidation plan
4. apply the plan from handler/runtime wiring

`server/src/handler-registration.ts` should apply plans, not encode semantic
diffing policy itself.

## 10. Transport Boundary

Runtime code does not talk directly to LSP transport primitives for incidental
effects such as logging or CodeLens refresh.

- `server/src/runtime/runtime-sink.ts`

The runtime sink is the runtime-facing interface for:

- info/error logging
- diagnostics clearing
- CodeLens refresh requests

`composition-root.ts` binds this sink to the actual LSP connection.

This keeps runtime logic transport-agnostic and reduces coupling to VS Code /
LSP-specific APIs.

## 11. Dependency Direction

The codebase is intentionally package-ready even though it is still shipped as
one extension package.

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

These are the intended future extraction seams if the engine is ever split out
for another consumer.

## 12. Core Invariants

The architecture relies on these rules:

- document facts describe syntax and ranges only
- binding owns source-side name resolution
- abstract value analysis owns dynamic class reasoning
- read models are the only provider-facing semantic vocabulary
- rewrite legality is decided in core rewrite code, not in providers
- runtime owns invalidation orchestration
- transport-specific behavior is behind runtime sinks and providers

If a new feature cannot be explained within those rules, it is probably cutting
across the wrong layer.
