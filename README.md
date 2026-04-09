# CSS Module Explainer

A VS Code extension that brings **Go to Definition**, **Hover**,
**Autocomplete**, **Diagnostics**, **Quick Fixes**, and **Find
References** to the `classnames/bind` `cx()` pattern with CSS
Modules.

```tsx
import classNames from "classnames/bind";
import styles from "./Button.module.scss";

const cx = classNames.bind(styles);

<div className={cx("button", { active: isActive }, size)}>Click me</div>;
```

Existing CSS Modules extensions stop working the moment the chain
passes through `classNames.bind()`. This one picks up exactly there.

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

Supported patterns (all from a single cx binding):

- **String literal**: `cx('btn')`
- **Object map**: `cx({ active: isActive, disabled })`
- **Multi-arg mix**: `cx('btn', 'primary', { disabled }, size)`
- **Template literal**: ``cx(`btn-${variant}`)``
- **Variable (string-literal union)**: `cx(size)` where `size: 'sm' | 'md' | 'lg'`
- **Conditional**: `cx('btn', isActive && 'active')`
- **Array spread**: `cx(['btn', 'primary'])`

Multi-binding files (two or more `cx = classNames.bind(x)` in one
module), aliased imports (`import cn from 'classnames/bind'`), and
function-scoped bindings are all handled.

## Install

Not yet published — the extension ships as a `.vsix` during the 1.0
stabilization window. Grab it from
[GitHub Releases](https://github.com/yongsk0066/css-module-explainer/releases)
or wait for the marketplace listing.

## Development

```bash
pnpm install
pnpm check        # oxlint + oxfmt --check + tsc -b
pnpm test         # vitest unit + protocol tiers (232+ tests)
pnpm test:bench   # vitest bench perf suite
pnpm build        # rolldown client + server bundles
```

### Test tiers

| Tier                  | Location          | What it covers                                                         |
| --------------------- | ----------------- | ---------------------------------------------------------------------- |
| **Tier 1** (unit)     | `test/unit/`      | Pure functions: SCSS parsing, cx AST walkers, providers with mock deps |
| **Tier 2** (protocol) | `test/protocol/`  | Full LSP JSON-RPC roundtrip through an in-process harness              |
| **Tier 3** (E2E)      | `test/e2e/`       | _(Plan 10.5 — deferred)_ real VS Code via `@vscode/test-electron`      |
| **Bench**             | `test/benchmark/` | `vitest bench` — cold hover ~0.03 ms, 200-rule parse ~0.73 ms          |

### Dogfooding sandbox

`examples/` contains nine scenario sub-packages (`01-basic`,
`02-multi-binding`, …) for manual QA in a real Extension
Development Host. Launch `F5` in VS Code to open the host with
the extension attached, then open any scenario folder. See
[`examples/README.md`](./examples/README.md).

The sandbox is NOT included in the marketplace VSIX — see
`.vscodeignore`.

### Architecture

The extension runs as an LSP pair: a thin `client/` wrapper
spawns the `server/` process over Node IPC. The server owns the
heavy lifting — TypeScript AST walking, SCSS parsing, reverse
index, and all six providers.

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
│   └── util/         # pure helpers (hash, text, Levenshtein)
├── providers/        # definition, hover, completion, diagnostics,
│                     # code-actions, references, reference-lens
├── composition-root.ts   # createServer factory (DI hub)
└── server.ts             # 3-line entrypoint
```

Full architecture: `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md`.
Plan history: `docs/superpowers/plans/`.

## Contributing

The full code review process is documented in
`docs/superpowers/handoff/2026-04-10-session-handoff.md` §5. For
any provider or parser change, manual QA in at least two
relevant `examples/scenarios/*` directories is expected.

## License

MIT — see [LICENSE](./LICENSE).
