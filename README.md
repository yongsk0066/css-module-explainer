# CSS Module Explainer

Semantic language features for CSS Modules in VS Code.

The extension is built for projects that use CSS Modules through
`classnames/bind`, `classnames`, `clsx`, or direct `styles.*` access.
Definition, hover, references, rename, diagnostics, and code actions all
resolve through the same semantic pipeline.

```tsx
import classNames from "classnames/bind";
import styles from "./Button.module.scss";

const cx = classNames.bind(styles);

export function Button({ active, size }: { active: boolean; size: "sm" | "lg" }) {
  return <button className={cx("button", { active }, size)}>Save</button>;
}
```

## Features

- Source-side language features
  - Go to Definition and Hover from `cx(...)`, `styles.foo`, and `styles["foo-bar"]`
  - Completion inside `cx(`, `classnames(`, and `clsx(` calls
  - Diagnostics for unknown classes and missing module imports
  - Quick fixes to replace a misspelled class, add a missing selector, or create a missing module file
- Style-side language features
  - Find References and CodeLens from `.module.css`, `.module.scss`, and `.module.less`
  - Rename across style files and source call sites
  - Unused selector diagnostics
- Resolution behavior
  - `classnames/bind` bindings, multiple bindings per file, and function-local bindings
  - `classnames` / `clsx` calls that use `styles.foo` or `styles["foo-bar"]`
  - Template literals and symbol references with local flow analysis and TypeScript union fallback
  - `css-loader`-compatible class name transform modes

## Supported patterns

- `cx("button")`
- `cx("button", { active, disabled })`
- ``cx(`button-${variant}`)``
- `cx(size)` where `size` resolves from local control flow or string-literal unions
- `classnames(styles.button, flag && styles.active)`
- `clsx(styles.button, { [styles.active]: flag })`
- `styles.button`
- `styles["button-primary"]`

CSS, SCSS, and Less modules are supported. The extension activates for
TypeScript, TSX, JavaScript, JSX, CSS, SCSS, and Less files.

## Install

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yongsk0066.css-module-explainer)
or build from source.

```bash
pnpm install
pnpm package
code --install-extension css-module-explainer-*.vsix
```

## Configuration

All settings live under the `cssModuleExplainer.*` namespace.

### Core settings

| Setting                                         | Default     | Description                                        |
| ----------------------------------------------- | ----------- | -------------------------------------------------- |
| `cssModuleExplainer.features.definition`        | `true`      | Enable Go to Definition.                           |
| `cssModuleExplainer.features.hover`             | `true`      | Enable Hover.                                      |
| `cssModuleExplainer.features.completion`        | `true`      | Enable Completion.                                 |
| `cssModuleExplainer.features.references`        | `true`      | Enable Find References and CodeLens.               |
| `cssModuleExplainer.features.rename`            | `true`      | Enable Rename.                                     |
| `cssModuleExplainer.diagnostics.severity`       | `"warning"` | Severity for unknown-class diagnostics.            |
| `cssModuleExplainer.diagnostics.unusedSelector` | `true`      | Show unused selector hints in style modules.       |
| `cssModuleExplainer.diagnostics.missingModule`  | `true`      | Warn when a CSS Module import cannot be resolved.  |
| `cssModuleExplainer.hover.maxCandidates`        | `10`        | Maximum dynamic candidates shown in hover.         |
| `cssModuleExplainer.scss.classnameTransform`    | `"asIs"`    | Mirror of `css-loader` `modules.localsConvention`. |

### Class name transform

For a selector `.btn-primary`:

| Mode            | Exposed keys                | Notes                           |
| --------------- | --------------------------- | ------------------------------- |
| `asIs`          | `btn-primary`               | Original selector only.         |
| `camelCase`     | `btn-primary`, `btnPrimary` | Both forms resolve.             |
| `camelCaseOnly` | `btnPrimary`                | Alias only. Rename is rejected. |
| `dashes`        | `btn-primary`, `btnPrimary` | Dashes become word boundaries.  |
| `dashesOnly`    | `btnPrimary`                | Alias only. Rename is rejected. |

Alias-only modes keep navigation and references, but rename is blocked
because the reverse mapping back to the original selector is lossy.

### Path alias resolution

The extension resolves non-relative CSS Module imports from:

- `compilerOptions.paths` in the workspace `tsconfig.json` or `jsconfig.json`
- legacy `cssModules.pathAlias` settings, when a workspace already uses that key

This allows imports such as:

```ts
import styles from "@/components/Button.module.scss";
import theme from "@styles/theme.module.scss";
```

`cssModules.pathAlias` remains a compatibility input. It is not part of the
core runtime architecture and can be retired later without changing semantic
resolution.

## Architecture

The runtime is organized around one semantic pipeline.

```text
source/style text
  -> HIR documents
  -> scoped binding layer
  -> abstract state layer
  -> read models
  -> LSP providers
```

Relevant directories:

```text
server/src/
├── core/
│   ├── hir/             # source/style document facts
│   ├── binder/          # source-side scopes, declarations, and binding graph
│   ├── abstract-value/  # class-value domain and selector projection
│   ├── query/           # provider-facing read models and semantic contracts
│   ├── rewrite/         # text rewrite planning
│   ├── semantic/        # workspace reference collection and shared policy
│   ├── scss/            # style parsing and transform views
│   ├── cx/              # TypeScript AST walkers for bindings and expressions
│   ├── ts/              # TypeScript program and source-file utilities
│   ├── indexing/        # document analysis cache and file indexing
│   └── util/            # small runtime helpers
├── providers/           # LSP adapters over read models
├── composition-root.ts
└── server.ts
```

HIR keeps source-preserving document facts. Binding lives in the binder layer.
Dynamic class reasoning lives in the abstract-value layer. Providers read stable
semantic summaries instead of recomputing resolution ad hoc.

## Development

Requirements:

- Node.js `>= 22`
- `pnpm@10`

Common commands:

```bash
pnpm install
pnpm check
pnpm test
pnpm test:bench
pnpm build
pnpm package
```

Test layout:

| Tier      | Location          | Purpose                                              |
| --------- | ----------------- | ---------------------------------------------------- |
| Unit      | `test/unit/`      | Pure logic and provider tests with mock dependencies |
| Protocol  | `test/protocol/`  | Full LSP roundtrips through the in-process harness   |
| Benchmark | `test/benchmark/` | Provider microbenchmarks                             |

## Examples

`examples/` contains scenario-based manual QA fixtures for the extension
development host. See [examples/README.md](./examples/README.md).

## Contributing

Before opening a change:

- run `pnpm check`
- run `pnpm test`
- verify the affected scenario in `examples/` when the change touches editor behavior

Keep commits scoped to a single concern when possible.

## License

MIT. See [LICENSE](./LICENSE).
