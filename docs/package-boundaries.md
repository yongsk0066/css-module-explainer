# Package-Ready Dependency Direction

This document describes the dependency direction needed for a future split into:

- `engine-core`
- `engine-lsp`
- optional `server-runtime`

This is a preparation step. It is not a package split by itself.

## Target Direction

Allowed direction:

```text
providers / lsp adapters
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

## Reasoning

- `core` must describe semantic behavior without LSP transport concerns
- `runtime` must orchestrate work without depending on provider-specific contracts
- `runtime` must not know about LSP transport types directly
- `providers` should consume stable façade entrypoints, not internal deep files

## Current Façade Boundaries

- `server/src/core/query/index.ts`
- `server/src/core/rewrite/index.ts`
- `server/src/core/semantic/index.ts`
- `server/src/runtime/index.ts`

Provider-facing imports should prefer these entrypoints.

## What This Enables Later

If these boundaries hold, a future package split should mostly be:

1. file moves
2. export-map setup
3. test/workspace rewiring

It should not require semantic rewrites.
