# 03-multiline-heavy (stub)

**Q3 B+D** — multi-line `cx()` calls where each argument sits on its
own line, with conditionals and spreads mixed in:

```tsx
<div
  className={cx(
    'container',
    'padded',
    isActive && 'active',
    size === 'lg' && 'large',
    isError ? 'error' : 'ok',
    ...extraClasses,
    { highlight: isHighlighted, disabled }
  )}
/>
```

Implementation deferred — see Plan 11.5 task 11.5.5.
