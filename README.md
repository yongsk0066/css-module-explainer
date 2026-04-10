# CSS Module Explainer

IDE support for the `classnames/bind` `cx()` pattern with CSS Modules — Go to Definition, Hover, Autocomplete, Diagnostics, Quick Fixes, and Find References.

```tsx
import classNames from "classnames/bind";
import styles from "./Button.module.scss";

const cx = classNames.bind(styles);

<div className={cx("button", { active: isActive }, size)}>Click me</div>;
```

## Features

| Feature                | Trigger                                              | Returns                                                                   |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| **Hover**              | Cursor on a class literal inside `cx()`              | Markdown with the matching SCSS rule and its declarations                 |
| **Go to Definition**   | `Cmd/Ctrl-click` on the literal                      | Peek + jump to the `.className` selector in the `.module.scss` file       |
| **Autocomplete**       | `'`, `"`, `` ` ``, or `,` inside an open `cx(`       | Every class in the bound SCSS module, with a live rule preview            |
| **Diagnostics**        | Saved TSX file                                       | Warnings for unknown classes with "did you mean?" hints (Levenshtein ≤ 3) |
| **Quick Fix**          | Light bulb on a diagnostic                           | One-click rename to the suggested class                                   |
| **Find References**    | Right-click a class selector inside a `.module.scss` | Every `cx('that-class')` call site across the workspace                   |
| **Reference CodeLens** | Above every selector in `.module.scss`               | Inline "N references" counter with click-through                          |

Supported patterns:

- `cx('btn')` — string literal
- `cx({ active: isActive, disabled })` — object map
- `cx('btn', 'primary', { disabled }, size)` — multi-arg mix
- ``cx(`btn-${variant}`)`` — template literal
- `cx(size)` where `size: 'sm' | 'md' | 'lg'` — variable (union type)
- `cx('btn', isActive && 'active')` — conditional
- `cx(['btn', 'primary'])` — array spread

Multi-binding files, aliased imports, namespace imports, function-scoped bindings, and `styles.className` direct access are all supported.

## Install

Not yet published — build from source:

```bash
pnpm build
pnpm exec vsce package --no-dependencies
code --install-extension css-module-explainer-*.vsix
```

## Configuration

| Setting                                     | Type      | Default | Description                                                     |
| ------------------------------------------- | --------- | ------- | --------------------------------------------------------------- |
| `cssModuleExplainer.enable`                 | `boolean` | `true`  | Master on/off switch                                            |
| `cssModuleExplainer.diagnostics.enable`     | `boolean` | `true`  | Publish missing-class warnings                                  |
| `cssModuleExplainer.diagnostics.debounceMs` | `number`  | `200`   | Delay before re-running diagnostics after an edit               |
| `cssModuleExplainer.codeLens.enable`        | `boolean` | `true`  | Show reference counts above selectors in `.module.scss`         |
| `cssModuleExplainer.trace.server`           | `string`  | `"off"` | LSP trace level (`"off"`, `"messages"`, `"verbose"`)            |
| `cssModuleExplainer.maxFilesIndexed`        | `number`  | `5000`  | Maximum number of TS/TSX files the background indexer will walk |

## Development

```bash
pnpm install
pnpm check        # oxlint + oxfmt --check + tsc -b
pnpm test         # vitest unit + protocol tiers (253 tests)
pnpm test:bench   # vitest bench perf suite
pnpm build        # rolldown client + server bundles
```

### Test tiers

| Tier                  | Location          | What it covers                                                         |
| --------------------- | ----------------- | ---------------------------------------------------------------------- |
| **Tier 1** (unit)     | `test/unit/`      | Pure functions: SCSS parsing, cx AST walkers, providers with mock deps |
| **Tier 2** (protocol) | `test/protocol/`  | Full LSP JSON-RPC roundtrip through an in-process harness              |
| **Tier 3** (deferred) | `test/e2e/`       | Real VS Code via `@vscode/test-electron` (not yet wired)               |
| **Bench**             | `test/benchmark/` | `vitest bench` — cold hover ~0.03 ms, 200-rule parse ~0.73 ms          |

### Architecture

```
VS Code
  │
  │ LSP (JSON-RPC over IPC)
  ▼
server/src/
├── core/
│   ├── scss/         # postcss-scss → ScssClassMap
│   ├── cx/           # TypeScript AST walkers (binding + calls)
│   ├── ts/           # 2-tier TypeScript strategy (in-flight + workspace)
│   ├── indexing/     # analysis cache, reverse index, file walker
│   └── util/         # pure helpers (hash, text, Levenshtein, LRU)
├── providers/        # definition, hover, completion, diagnostics,
│                     # code-actions, references, reference-lens
├── composition-root.ts   # createServer factory (DI hub)
└── server.ts             # 3-line entrypoint
```

### Examples sandbox

`examples/` contains nine scenario sub-packages for manual QA in
the Extension Development Host. See
[`examples/README.md`](./examples/README.md).

## Contributing

Run `pnpm check && pnpm test` and manually QA in at least two
relevant `examples/scenarios/*` directories before submitting.

## License

MIT — see [LICENSE](./LICENSE).
