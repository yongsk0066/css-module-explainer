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
   pnpm install      # run once at repo root
   cd examples
   pnpm dev
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

### Basics

| # | Folder | Pattern |
|---|---|---|
| 01 | `01-basic/` | Single binding, string + object arg, multi-arg mix |
| 03 | `03-multiline/` | Multi-line cx call with conditionals + spreads |
| 09 | `09-large/` | Stress test: 100+ cx() calls |

### Binding

| # | Folder | Pattern |
|---|---|---|
| 02 | `02-multi-binding/` | Two bindings (Card + Button) in one file |
| 06 | `06-alias/` | `import cn from 'classnames/bind'` |
| 07 | `07-function-scoped/` | cx binding declared inside a function body |
| 13 | `13-shadowing/` | Imported `cx` and `styles` shadowed by local bindings |

### Dynamic

| # | Folder | Pattern |
|---|---|---|
| 04 | `04-dynamic/` | Template literal `` cx(`btn-${variant}`) `` |
| 10 | `10-clsx/` | `clsx(styles.btn, ...)` and bare `<div className={styles.x}>` |
| 14 | `14-non-finite-dynamic/` | finite set, prefix, and function-derived dynamic resolution |

### Style-side

| # | Folder | Pattern |
|---|---|---|
| 05 | `05-global-local/` | `:global` / `:local` selectors |
| 12 | `12-nested-style-facts/` | `&.class`, plain nesting, and BEM suffix selector registration |

### Resolution

| # | Folder | Pattern |
|---|---|---|
| 08 | `08-css-only/` | `.module.css` instead of `.module.scss` |
| 11 | `11-ts-path/` | `tsconfig.json` / `jsconfig.json` `compilerOptions.paths` |

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
- **BEM suffix rename on `&--x` / `&__x` nested blocks**: in
  the same `02-multi-binding/Button.module.scss`, rename
  `&--primary` under `.button` — only the `--primary` slice of
  the SCSS file is rewritten; every `cxButton('button--primary')`
  in the TSX file updates in lockstep. Compound forms like
  `&.active`, grouped siblings like `&--a, &--b`, and
  non-bare parents remain rejected as a known limitation.
- **Rename near a template literal call site**: in `04-dynamic`,
  rename `.btn-primary` — the `` cx(`btn-${variant}`) ``
  template literal is NOT rewritten. Find References still
  lists the template call site.
- **Nested style fact registration**: in `12-nested-style-facts`,
  hover or jump from `type-card`, `compact`, `body`, `disabled`,
  `item--primary`, and `item__icon`. Each token should resolve to
  the selector that actually introduced it, not to an inherited
  parent class from `&` expansion.
- **Shadowing stays local**: in `13-shadowing`, hover on the outer
  `cx("panel")` and `styles.title` — they should resolve. Hover on
  the inner shadowed `cx("panel")` and shadowed `styles.badge` —
  they should not resolve as CSS Module references.
- **Dynamic certainty tiers**: in `14-non-finite-dynamic`, compare
  hover on `size`, `"btn-" + variant`, and `resolveStatusClass(status)`.
  The sandbox should expose finite-set, prefix, and possible/top-like
  behavior in one place.
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
- **Missing-module warning on typos**: in any scenario, change
  `import styles from './Button.module.scss'` to a nonexistent
  filename — a `missing-module` warning appears on the import
  string immediately, even in files that only use `styles.x`
  without `classnames/bind`. Reverting the typo clears it on
  the next debounce.
- **`classnameTransform` alias resolution**: set
  `"cssModuleExplainer.scss.classnameTransform": "camelCase"` in
  workspace settings and open `02-multi-binding`. Both
  `styles['btn-primary']` and `styles.btnPrimary` should resolve
  to the same selector (hover, go-to-definition, completion).
  Rename `btnPrimary` from the alias — the SCSS source rewrites
  the original `.btn-primary` token, not the alias copy.
- **`classnameTransform` rename reject in `*Only` modes**: switch
  the setting to `"camelCaseOnly"` and retry the rename on
  `btnPrimary`. The rename UI should be suppressed entirely —
  VS Code falls back to plain word-rename with no workspace
  edits.

## Vite+

The sandbox intentionally uses `vp` from `vite-plus` instead of
raw `vite`. This keeps the dogfood app on the same unified
toolchain that VoidZero is pushing forward, while still using a
normal `vite.config.ts`.

## What's not here

- **Automated tests.** Tier 1 lives in `test/unit/`, Tier 2 in
  `test/protocol/`, benchmarks in `test/benchmark/`. This
  sandbox is manual-QA only.
- **A separately published package.** `examples/` has its own
  `package.json`, but it is only a workspace QA sandbox. The
  root `pnpm install` provisions its dependencies; it is not
  shipped in the VSIX.

## Design decisions

Each scenario isolates a single `cx()` pattern so regressions
are immediately visible during manual QA.
