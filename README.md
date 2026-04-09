# CSS Module Explainer

A VS Code extension that adds Go to Definition, Hover, Autocomplete, and Diagnostics for the `classnames/bind` `cx()` pattern with CSS Modules.

```tsx
import classNames from 'classnames/bind';
import styles from './Button.module.scss';

const cx = classNames.bind(styles);

<div className={cx('button', { active: isActive })}>Click me</div>
```

Existing CSS Modules extensions stop working once the chain passes through `classnames.bind()`. This one picks up exactly there.

**Status:** Pre-release. Full feature docs land with the 1.0.0 marketplace publish.

## Development

```bash
pnpm install
pnpm check      # lint + format:check + typecheck
pnpm test       # vitest unit tests
pnpm build      # rolldown bundles client + server
```

See `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md` for the full design document.

## License

MIT — see [LICENSE](./LICENSE).
