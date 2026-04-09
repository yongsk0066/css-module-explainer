# 04-dynamic-keys (stub)

Template-literal dynamic class names:

```tsx
const variant: 'primary' | 'secondary' = props.kind;
const size = 'lg';
<div className={cx(`btn-${variant}-${size}`)} />
<div className={cx(`icon-${name}`)} />
```

Exercises `parseCxCalls` template branch + `resolveCxCallToSelectorInfos`
prefix filter.

Implementation deferred — see Plan 11.5 task 11.5.5.
