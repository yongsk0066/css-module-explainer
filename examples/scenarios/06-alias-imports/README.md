# 06-alias-imports (stub)

**Q7 B #3** — aliased classnames import:

```tsx
import cn from 'classnames/bind';
import styles from './foo.module.scss';
const classes = cn.bind(styles);
<div className={classes('header')} />
```

The `classNamesImportName` can be any identifier; the detector
tracks it per file.

Implementation deferred — see Plan 11.5 task 11.5.5.
