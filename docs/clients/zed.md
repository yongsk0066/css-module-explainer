# Zed

This project now ships a Rust `omena-lsp-server` entrypoint. For a local checkout, build the repo first:

```bash
pnpm install
pnpm build
```

The server entrypoint is:

```text
<repo>/dist/bin/<platform>-<arch>/omena-lsp-server
```

## settings.json example

Zed can run an additional language server by:

1. defining a server under `lsp`
2. enabling that server for the languages you want under `languages.<Language>.language_servers`

Example:

```json
{
  "lsp": {
    "css-module-explainer": {
      "binary": {
        "path": "/absolute/path/to/css-module-explainer/dist/bin/darwin-arm64/omena-lsp-server",
        "arguments": []
      }
    }
  },
  "languages": {
    "TypeScript": {
      "language_servers": ["css-module-explainer", "..."]
    },
    "TSX": {
      "language_servers": ["css-module-explainer", "..."]
    },
    "JavaScript": {
      "language_servers": ["css-module-explainer", "..."]
    },
    "CSS": {
      "language_servers": ["css-module-explainer", "..."]
    },
    "SCSS": {
      "language_servers": ["css-module-explainer", "..."]
    },
    "Less": {
      "language_servers": ["css-module-explainer", "..."]
    }
  }
}
```

`"..."` keeps Zed's default language servers enabled alongside CSS Module Explainer.

## Notes

- Replace `darwin-arm64` with your packaged `<platform>-<arch>` directory.
- This server is intended to run beside Zed's default TS/JS server, not replace it.
- Start with `TypeScript`, `TSX`, and `SCSS` if you want the smallest config surface.
- The repo-local smoke command for this transport is:

```bash
pnpm cme-check run rust/omena-lsp-server/thin-client-boundary
```

## References

- Zed language configuration docs: https://zed.dev/docs/languages/typescript
- Zed language server settings examples: https://zed.dev/docs/languages/dart
