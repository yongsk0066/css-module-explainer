# Vitest CME

Internal Phase 1 test DSL seed for CSS Module Explainer.

This package intentionally does not move existing `test/_fixtures` ownership and
does not migrate existing protocol/unit tests. The initial surface is limited to:

- `workspace()` fixture text parser
- marker syntax: `/*|*/`, `/*at:name*/`, `/*<range>*/.../*</range>*/`
- `scenario()` wrapper actions: `hover`, `definition`, `prepareRename`
- `registerCmeMatchers()` with five domain-oriented matchers

The package is self-tested from `test/unit/vitest-cme`.
