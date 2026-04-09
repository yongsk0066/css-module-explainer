# 09-large-component (stub)

Perf smoke test: a single component with 100+ `cx()` calls and a
`.module.scss` with 200+ class rules. Not a benchmark (that's
Plan 11); this is a "does the extension stay responsive during
typing" eyeball check.

Target: on a 2023 MacBook Pro the hover / completion requests
should stay under 50 ms even with 100+ call sites in a single
file.

Implementation deferred — see Plan 11.5 task 11.5.5.
