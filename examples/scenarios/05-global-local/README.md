# 05-global-local (stub)

**Q6 B #1 + #2** — `:global` / `:local` CSS Modules selectors:

```scss
:global(.body-theme-dark) .container { background: #111; }
:local(.button) { color: white; }
.input :global(.placeholder) { opacity: 0.5; }
```

Only `.container`, `.button`, `.input` should appear in the cx()
class list — the `:global(…)` wrapped names are excluded.

Implementation deferred — see Plan 11.5 task 11.5.5.
