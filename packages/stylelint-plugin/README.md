# stylelint-plugin-css-module-explainer

First-cut Stylelint consumer for CSS Module Explainer.

Current rules:

- `css-module-explainer/unused-selector`
- `css-module-explainer/missing-composed-module`
- `css-module-explainer/missing-composed-selector`

Recommended config:

```js
export default {
  extends: ["stylelint-plugin-css-module-explainer/recommended"],
};
```

Direct rule config:

```js
export default {
  plugins: ["stylelint-plugin-css-module-explainer"],
  rules: {
    "css-module-explainer/unused-selector": [true],
    "css-module-explainer/missing-composed-module": [true],
    "css-module-explainer/missing-composed-selector": [true],
  },
};
```

Current limitations:

- first cut is focused on `.module.css` / `.module.scss` / `.module.less`
- current package is still a local repo package, not a published artifact
