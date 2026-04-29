# omena-incremental

`omena-incremental` owns the small, serializable invalidation contract that lets
Omena runtimes decide which semantic nodes need recomputation between revisions.

Current public product:

- `omena-incremental.boundary` — boundary summary for the V0 dirty-node model.
- `plan_incremental_computation` — deterministic node invalidation over stable
  node IDs, input digests, and dependency edges.
- `snapshot_from_graph_input` — reusable snapshot materialization for callers
  that want to carry revision state across requests.

Primary check:

```sh
cargo test --manifest-path rust/Cargo.toml -p omena-incremental
```
