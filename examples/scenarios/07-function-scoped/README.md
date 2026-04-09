# 07-function-scoped (stub)

**Q7 B #7** — `cx` binding declared inside a function body, not
at module scope:

```tsx
export function Button() {
  const cx = classNames.bind(styles);
  return <div className={cx('button')} />;
}
```

The binding's `scope` field carries the enclosing function's line
range, and providers must not find the binding from OUTSIDE that
scope.

Implementation deferred — see Plan 11.5 task 11.5.5.
