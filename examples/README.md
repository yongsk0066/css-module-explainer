# css-module-explainer examples sandbox

**Single React app** containing every supported `cx()` pattern
as a separate component. Launch once, browse all scenarios
through the sidebar.

## How to use

### Option A — Extension Development Host (recommended)

1. Open this repository in VS Code.
2. Press **F5** to launch the Extension Development Host. A
   second VS Code window opens with the extension attached.
3. In the second window, open this `examples/` folder.
4. Start the sandbox dev server in a terminal:
   ```bash
   cd examples
   pnpm install
   pnpm dev          # Vite+ (vp CLI) — preferred
   # or, if vp regresses:
   pnpm dev:vite     # plain vite fallback
   ```
5. Open any `src/scenarios/*/*.tsx` file in the attached VS
   Code window and exercise the providers:
   - **Hover** on a class literal → markdown with the SCSS rule
   - **Cmd-click** → jump to the `.className` selector
   - **Type `cx('`** → completion list
   - **Typo** → diagnostic underline + Quick Fix
   - **Find References** on a class inside `.module.scss` → every call site

### Option B — Install the extension locally

```bash
# from the repository root
pnpm build
pnpm exec vsce package --no-dependencies
code --install-extension css-module-explainer-*.vsix
```

Then restart VS Code and open this folder normally.

## Scenarios

Every scenario lives under `src/scenarios/<nn-name>/` and is
listed in `src/App.tsx`'s sidebar.

| # | Folder | Pattern |
|---|---|---|
| 01 | `01-basic/` | Single binding, string + object arg, multi-arg mix |
| 02 | `02-multi-binding/` | Two bindings (Card + Button) in one file, with `&`-nested selectors |
| 03 | `03-multiline/` | Multi-line cx call with conditionals + spreads |
| 04 | `04-dynamic/` | Template literal `` cx(`btn-${variant}`) `` |
| 05 | `05-global-local/` | `:global` / `:local` selectors |
| 06 | `06-alias/` | `import cn from 'classnames/bind'` |
| 07 | `07-function-scoped/` | cx binding declared inside a function body |
| 08 | `08-css-only/` | `.module.css` instead of `.module.scss` |
| 09 | `09-large/` | Stress test: 100+ cx() calls |
| 10 | `10-clsx/` | `clsx(styles.btn, ...)` and bare `<div className={styles.x}>` |

The directory structure is locked; each scenario sub-directory
should drop into `src/scenarios/` without layout changes. New
scenarios extend the list as the dogfood loop surfaces gaps.

## Editor-behavior checklist

These cross-cutting behaviors should hold on any scenario. Walk
through them whenever you update the provider layer.

- **Rename on a flat selector with `&`-nested children**:
  in `02-multi-binding/Button.module.scss`, rename `.button` —
  succeeds and rewrites every call site. Rename on `&:hover`
  is rejected; VS Code falls back to word-rename.
- **Rename near a template literal call site**: in `04-dynamic`,
  rename `.btn-primary` — the `` cx(`btn-${variant}`) ``
  template literal is NOT rewritten. Find References still
  lists the template call site.
- **Unsaved SCSS edits reflect in diagnostics immediately**: open
  any scenario's `.module.scss`, add or remove a class without
  saving, and any diagnostic in the matching `.tsx` file updates
  within the debounce window.
- **Watched-file changes refresh Find References**: add a new
  class to a SCSS file and save. Find References on the new
  class immediately lists template-literal call sites that
  would match it, without needing to touch the `.tsx` file.
- **Unused selector faded text**: declare a class that is never
  referenced by any `.tsx` — it renders faded with the "unused"
  diagnostic tag.

## Vite+ vs plain Vite

The primary runner is `vp` (the `vite-plus` CLI — the same
binary the upstream project ships). It bundles `vite`,
`oxlint`, and `oxfmt` as a single unified toolchain. When
Vite+ alpha regresses (it is still `0.1.x`), switch to
`pnpm dev:vite` — it uses the same `vite.config.ts` and the
same React plugin, just without the `vp` wrapper.

## What's not here

- **Automated tests.** Tier 1 lives in `test/unit/`, Tier 2 in
  `test/protocol/`, benchmarks in `test/benchmark/`. This
  sandbox is manual-QA only.
- **A workspace that the root `pnpm install` traverses into.**
  `examples/` has its own isolated `package.json`; running
  `pnpm install` from the repo root does NOT install this
  folder's dependencies. Bootstrap it explicitly with
  `cd examples && pnpm install`.

## Design decisions

Each scenario isolates a single `cx()` pattern so regressions
are immediately visible during manual QA.
