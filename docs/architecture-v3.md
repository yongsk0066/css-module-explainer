# 3.0 Architecture

This document describes the intended runtime architecture for 3.0.

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

In 3.0:

- HIR is primary for document facts
- binding graph is primary for source-side name resolution
- abstract domain is primary for dynamic value reasoning
- read models are primary for provider consumption

Anything else must be clearly derived or test-only.

This is why the old semantic graph builders were moved out of runtime.

## Non-Negotiable Rules

1. no runtime compatibility path may survive "for safety"
2. no provider-specific semantic derivation when a read model can own it
3. no certainty string chosen without a semantic contract
4. no runtime type that exists only to preserve an older competing architecture

## Acceptance Standard

The architecture is considered complete when:

- one coherent pipeline explains hover, definition, references, rename, completion, and diagnostics
- no runtime feature depends on line-range or document-order binding heuristics
- no provider still depends on the deleted semantic-graph-first architecture
