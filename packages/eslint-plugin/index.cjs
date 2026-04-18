const sourceCheckRule = require("./lib/source-check.cjs");

const plugin = {
  meta: {
    name: "eslint-plugin-css-module-explainer",
    version: "0.0.1",
  },
  rules: {
    "source-check": sourceCheckRule,
  },
};

plugin.configs = {
  recommended: [
    {
      plugins: {
        "css-module-explainer": plugin,
      },
      rules: {
        "css-module-explainer/source-check": "error",
      },
    },
  ],
};

module.exports = plugin;
