const sourceCheckRule = require("./lib/source-check.cjs");
const missingModuleRule = require("./lib/missing-module.cjs");
const invalidClassReferenceRule = require("./lib/invalid-class-reference.cjs");

const plugin = {
  meta: {
    name: "eslint-plugin-css-module-explainer",
    version: "0.0.1",
  },
  rules: {
    "missing-module": missingModuleRule,
    "invalid-class-reference": invalidClassReferenceRule,
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
        "css-module-explainer/missing-module": "error",
        "css-module-explainer/invalid-class-reference": "error",
      },
    },
  ],
};

module.exports = plugin;
