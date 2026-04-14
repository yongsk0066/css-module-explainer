# 3.x Architecture

This document describes the runtime architecture from 3.0 onward.

It is the reference for the production pipeline.

## Pipeline

```text
Source AST -> SourceDocumentHIR ----\
                                     -> Scoped Binding Layer
Style AST  -> StyleDocumentHIR -----/        |
                                              v
                                     Abstract State Layer
                                              |
                                              v
                                         Read Models
                                              |
                                              v
                                     Provider Policy Layer
                                              |
                                              v
                                           LSP
```

## Layer Ownership

### SourceDocumentHIR

Owns:

- source-preserving class expressions
- style imports
- utility bindings
- source ranges and textual identity

Does not own:

- name resolution policy
- dynamic value reasoning

### StyleDocumentHIR

Owns:

- selector views and canonical names
- nested safety
- BEM suffix metadata
- source-preserving style ranges

Does not own:

- source-side binding
- dynamic class-value reasoning

### Scoped Binding Layer

Owns:

- scopes
- declarations
- references
- import reachability
- authoritative source-side resolution

Current runtime artifacts:

- `sourceBinder`
- `sourceBindingGraph`

### Abstract State Layer

Owns:

- abstract class-value domain
- joins/widening
- flow/type-union lift
- selector projection inputs

Primary artifacts:

- `AbstractClassValue`
- projection helpers
- expression semantics summaries

### Read Models

Owns:

- stable, provider-friendly semantic summaries
- source expression resolution
- selector usage
- style module usage
- rewrite safety

These are the only semantic shapes providers should read.

## Runtime Assembly

Runtime assembly is explicit.

- `server/src/runtime/shared-runtime-caches.ts`
  - process-wide caches shared across workspace runtimes
- `server/src/runtime/workspace-runtime.ts`
  - one runtime bundle per workspace root
- `server/src/composition-root.ts`
  - orchestration only

`composition-root.ts` wires runtimes together. It should not grow feature
logic back into the top-level assembly path.

## Reference Collection and Storage

Reference ingestion and reference storage are separate responsibilities.

- `server/src/core/semantic/reference-collector.ts`
  - derives semantic reference contributions from the current runtime pipeline
- `server/src/core/semantic/workspace-reference-index.ts`
  - stores/query selector references and module usages
- `server/src/core/semantic/reference-dependencies.ts`
  - stores dependency reverse-lookup data for invalidation

The store should not re-derive contributions from low-level runtime artifacts.

## Invalidation Runtime

Invalidation is modeled as explicit runtime contracts.

- `server/src/runtime/dependency-snapshot.ts`
  - captures open-document and dependency lookup state
- `server/src/runtime/watched-file-changes.ts`
  - classifies file watcher events into semantic invalidation inputs
- `server/src/runtime/invalidation-planner.ts`
  - computes recomputation plans from settings/file changes

`handler-registration.ts` applies these plans. It should not own change
classification, semantic diffing, or dependency lookup policy.

## Rewrite Policy

Style facts and rewrite policy are separate.

- `StyleDocumentHIR`
  - style facts, ranges, selector metadata
- `server/src/core/rewrite/read-style-rewrite-policy.ts`
  - rewrite-specific summary derived from style facts
- `server/src/core/rewrite/selector-rename.ts`
  - consumes rewrite policy summaries and emits rewrite plans

Providers should not interpret nested safety, alias lossiness, or dependency
blocking rules directly.

### Provider Policy Layer

Owns:

- LSP-specific policy
- error shaping
- UI formatting
- conversion to `WorkspaceEdit`, `Hover`, `CodeLens`, diagnostics

Providers must not:

- resolve bindings ad hoc
- recompute selector projection ad hoc
- invent certainty policy ad hoc

## Derived Caches vs Primary Reasoning

In 3.x:

- HIR is primary for document facts
- binding graph is primary for source-side name resolution
- abstract domain is primary for dynamic value reasoning
- read models are primary for provider consumption

Anything else must be clearly derived or test-only.

This is why the old semantic graph builders were moved out of runtime.

## Compatibility Policy

`cssModuleExplainer.pathAlias` is the native configuration surface.

`cssModules.pathAlias` is still accepted as a compatibility fallback in 3.x.
The server emits a deprecation notice per workspace root when that fallback is
used.

Compatibility behavior belongs in `server/src/settings.ts`. Runtime consumers
should read the normalized settings shape only.

## Non-Negotiable Rules

1. no runtime compatibility path may survive "for safety"
2. no provider-specific semantic derivation when a read model can own it
3. no certainty string chosen without a semantic contract
4. no runtime type that exists only to preserve an older competing architecture
5. handler/runtime boundaries must be enforced by architecture tests
6. providers must consume read models, not low-level runtime internals

## Acceptance Standard

The architecture is considered complete when:

- one coherent pipeline explains hover, definition, references, rename, completion, and diagnostics
- no runtime feature depends on line-range or document-order binding heuristics
- no provider still depends on the deleted semantic-graph-first architecture
- runtime assembly, invalidation, and rewrite policy each have explicit modules
