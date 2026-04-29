# Neovim

This project now ships a Rust `omena-lsp-server` entrypoint. For a local checkout, build the repo first:

```bash
pnpm install
pnpm build
```

The server entrypoint is:

```text
<repo>/dist/bin/<platform>-<arch>/omena-lsp-server
```

## Neovim 0.11+

Neovim's built-in LSP client can define a config with `vim.lsp.config()` and enable it with `vim.lsp.enable()`.

Example:

```lua
local repo_root = "/absolute/path/to/css-module-explainer"

vim.lsp.config("css_module_explainer", {
  cmd = {
    repo_root .. "/dist/bin/darwin-arm64/omena-lsp-server",
  },
  filetypes = {
    "typescript",
    "typescriptreact",
    "javascript",
    "javascriptreact",
    "css",
    "scss",
    "less",
  },
  root_markers = {
    "tsconfig.json",
    "package.json",
    ".git",
  },
})

vim.lsp.enable("css_module_explainer")
```

## Notes

- Replace `darwin-arm64` with your packaged `<platform>-<arch>` directory.
- This server complements your main JS/TS language server. Keep `ts_ls`, `vtsls`, or your existing TypeScript server enabled.
- The CSS Module Explainer server provides:
  - hover
  - definition
  - references
  - rename
  - diagnostics
  - code actions
    for CSS Modules semantics across JS/TS and style files.
- The repo-local smoke command for this transport is:

```bash
pnpm cme-check run rust/omena-lsp-server/thin-client-boundary
```

## References

- Neovim LSP docs: https://neovim.io/doc/user/lsp.html
