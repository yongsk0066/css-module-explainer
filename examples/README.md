# css-module-explainer examples sandbox

Manual dogfood sandbox. These scenarios are **not** run by any automated
test — their only purpose is to exercise the extension inside a real
VS Code instance against representative code patterns the parser
supports.

## How to use

1. Open this repository in VS Code.
2. Press **F5** to launch the Extension Development Host. A second VS
   Code window opens with the extension attached.
3. In the second window, `File → Open Folder…` → pick one of
   `examples/scenarios/01-basic/`, `02-multi-binding/`, etc.
4. Open any `.tsx` file that imports `classnames/bind`. Exercise:
   - **Hover** over a `cx('indicator')` literal → markdown with the
     SCSS rule.
   - **Cmd-click** (Go to Definition) → jumps to the `.indicator`
     selector in the `.module.scss` file.
   - **Type** `cx('` → completion list with every class name.
   - **Typo** → diagnostics underline + "Replace with 'indicator'"
     quick fix in the light bulb.
   - **Find References** on a class selector inside the `.module.scss`
     → every `cx()` call site that references it.
5. If Vite+ breaks, each scenario also runs under plain `pnpm vite`:
   ```bash
   cd examples/scenarios/01-basic
   pnpm install
   pnpm vite
   ```

## Scenarios

| # | Directory | Pattern |
|---|---|---|
| 01 | `01-basic/` | One cx binding, string + object arg, static class |
| 02 | `02-multi-binding/` | Two cx bindings in one file (Card + Button) |
| 03 | `03-multiline-heavy/` | Multi-line cx() calls (Q3 B+D) — stub |
| 04 | `04-dynamic-keys/` | `cx(\`${prefix}-${variant}\`)` template — stub |
| 05 | `05-global-local/` | `:global` / `:local` selectors (Q6 B) — stub |
| 06 | `06-alias-imports/` | `import cn from 'classnames/bind'` (Q7 B) — stub |
| 07 | `07-function-scoped/` | Function-scoped cx binding (Q7 B) — stub |
| 08 | `08-css-only/` | `.module.css` instead of `.module.scss` — stub |
| 09 | `09-large-component/` | 100+ cx() calls for perf smoke — stub |

Scenarios marked **stub** have a README describing intent; they have
no `package.json` yet. Contributions welcome.

## What's not here

- Automated tests. Tier 1 lives in `test/unit/`, Tier 2 in
  `test/protocol/`. Tier 3 E2E (Plan 10.5) will land under
  `test/e2e/` with a frozen fixture workspace — NOT under
  `examples/`.
- A monorepo workspace that the root `pnpm install` traverses into.
  Each scenario is independently installable so the marketplace CI
  stays fast and this sandbox never pollutes the server dependency
  tree.

## Design decisions

See `docs/superpowers/plans/2026-04-10-plan-11.5-examples-sandbox.md`
for the full plan and the decisions locked in during the original
brainstorming session (spec §8.6 + Q9).
