# 08-css-only (stub)

Plain `.module.css` (no SCSS compilation) so the vanilla postcss
fallback branch is exercised. Verifies that:

- `lang-registry` picks the `css` entry for the import
- `parseStyleModule` uses the `syntax: null` path
- All providers still work identically

Implementation deferred — see Plan 11.5 task 11.5.5.
