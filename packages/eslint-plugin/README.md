# eslint-plugin-css-module-explainer

First-cut ESLint consumer for CSS Module Explainer.

Current rules:

- `css-module-explainer/missing-module`
- `css-module-explainer/invalid-class-reference`
- `css-module-explainer/source-check`

Recommended flat config:

```js
import cssModuleExplainer from "eslint-plugin-css-module-explainer";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "css-module-explainer": cssModuleExplainer,
    },
    rules: {
      "css-module-explainer/missing-module": "error",
      "css-module-explainer/invalid-class-reference": "error",
    },
  },
];
```

Aggregate variant:

```js
"css-module-explainer/source-check": "error"
```

Supported options:

- `workspaceRoot`
- `classnameTransform`
- `pathAlias`
- `includeMissingModule`

Current limitations:

- source-side rules only
- style-side rules are not exposed yet
- this package is still a local workspace package, not a published artifact
