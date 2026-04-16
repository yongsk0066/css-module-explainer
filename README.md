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
  - Hover, Find References, and CodeLens from `.module.css`, `.module.scss`, and `.module.less`
  - Rename across style files and source call sites
  - Unused selector diagnostics
  - `composes` token definition/references/hover inside style modules
  - Diagnostics and quick fixes for unresolved composed modules
  - Same-file `@keyframes` hover/definition/references plus missing-target recovery
  - Local and imported `@value` definition/references/diagnostics plus missing-target recovery
- Resolution behavior
  - `classnames/bind` bindings, multiple bindings per file, and function-local bindings
  - `classnames` / `clsx` calls that use `styles.foo` or `styles["foo-bar"]`
  - Template literals and symbol references with local flow analysis and TypeScript union fallback
  - `css-loader`-compatible class name transform modes
  - Multi-root workspaces with resource-scoped transform and path-alias settings

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
- native `cssModuleExplainer.pathAlias`
- legacy `cssModules.pathAlias` settings, when a workspace already uses that key

This allows imports such as:

```ts
import styles from "@/components/Button.module.scss";
import theme from "@styles/theme.module.scss";
```

`cssModules.pathAlias` is a compatibility fallback. New setups should use
`cssModuleExplainer.pathAlias`. The compatibility key is deprecated and planned
for removal in `4.0.0`.

Example migration:

```jsonc
// before
"cssModules.pathAlias": {
  "@styles": "src/styles"
}

// after
"cssModuleExplainer.pathAlias": {
  "@styles": "src/styles"
}
```

## Architecture

The runtime follows one semantic pipeline:

```text
source/style text
  -> HIR documents
  -> source binding
  -> abstract class-value analysis
  -> read models
  -> LSP providers
```

Current structure:

```text
server/src/
├── core/
│   ├── hir/             # source/style document facts
│   ├── binder/          # source-side scopes and binding graph
│   ├── abstract-value/  # class-value domain and selector projection
│   ├── query/           # provider-facing semantic summaries
│   ├── rewrite/         # rename and rewrite planning
│   ├── semantic/        # workspace references, dependencies, composes graph
│   ├── scss/            # style parsing
│   ├── cx/              # source-side AST walkers
│   ├── ts/              # TypeScript integration
│   └── indexing/        # analysis cache and background indexing
├── runtime/             # workspace routing, snapshots, invalidation
├── providers/           # LSP adapters
├── composition-root.ts  # top-level assembly
└── server.ts
```

At a high level:

- HIR preserves document facts from source and style files.
- Binder resolves source-side names such as `cx`, `styles`, imports, locals, and shadowing.
- The abstract-value layer models dynamic class expressions such as flow branches, unions, and template prefixes.
- Semantic storage keeps workspace references, dependency lookups, and style-to-style relationships such as `composes`.
- Read models turn low-level semantic state into stable summaries that providers consume.
- Providers adapt those summaries to LSP features such as hover, definition, references, diagnostics, and rename.

The important constraint is that providers do not recompute semantic meaning on
their own. They read the shared pipeline.

For a fuller design explanation, see [docs/architecture-v3.md](./docs/architecture-v3.md).

## Development

Requirements:

- Node.js `>= 22`
- `pnpm@10`

Common commands:

```bash
pnpm install
pnpm check
pnpm check:semantic-smoke
pnpm test
pnpm test:bench
pnpm build
pnpm package
```

Batch checker:

```bash
pnpm check:semantic-smoke
pnpm check:workspace -- . --preset ci
pnpm check:workspace -- . --preset changed-style --changed-file src/Button.module.scss
pnpm check:workspace -- . --preset changed-source --changed-file src/App.tsx
pnpm check:workspace -- --list-bundles
pnpm check:workspace -- . --include-bundle source-missing --summary
pnpm check:workspace -- . --preset changed-style --changed-file src/Button.module.scss --compact
pnpm check:workspace -- . --format json --fail-on none
```

Current checker policy:

- `@keyframes` validation is same-file only in the current first pass
- `@value` validation covers local declarations and imported bindings between style modules
- named bundles group common finding families such as `ci-default`, `source-missing`, `style-recovery`, and `style-unused`
- presets also apply default bundle policy unless explicit include flags are provided
  - `ci` => `ci-default`
  - `changed-style` => `style-recovery`, `style-unused`
  - `changed-source` => `source-missing`
- `changed-style` and `changed-source` presets use compact text output by default
- `pnpm check:semantic-smoke` is the canonical repo-local smoke command
- semantic smoke cases are versioned in `scripts/semantic-smoke-corpus.ts` and should be updated when new semantic surfaces become release-relevant
- explicit CLI flags override preset defaults

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
