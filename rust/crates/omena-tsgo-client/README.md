# omena-tsgo-client

`omena-tsgo-client` owns the Rust-side contract for talking to TypeScript 7
`tsgo` as source-side ground truth.

The crate is intentionally narrow:

- describe the long-lived tsgo process model;
- describe the type-fact request and result contracts;
- keep the LSP request path policy explicit;
- provide a phase-3 boundary gate before the VS Code client becomes thin.

It does not run the full LSP server by itself. `omena-lsp-server` consumes this
boundary as the source-provider migration target.
