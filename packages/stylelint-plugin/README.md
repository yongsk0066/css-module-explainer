# stylelint-plugin-css-module-explainer

First-cut Stylelint consumer for CSS Module Explainer.

Current rule:

- `css-module-explainer/unused-selector`

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
  },
};
```

Current limitations:

- first cut is focused on `.module.css` / `.module.scss` / `.module.less`
- current package is still a local repo package, not a published artifact
