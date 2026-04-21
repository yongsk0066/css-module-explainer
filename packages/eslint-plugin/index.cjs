const sourceCheckRule = require("./lib/source-check.cjs");
const missingModuleRule = require("./lib/missing-module.cjs");
const missingStaticClassRule = require("./lib/missing-static-class.cjs");
const missingTemplatePrefixRule = require("./lib/missing-template-prefix.cjs");
const invalidClassReferenceRule = require("./lib/invalid-class-reference.cjs");
const noUnknownDynamicClassRule = require("./lib/no-unknown-dynamic-class.cjs");

const plugin = {
  meta: {
    name: "eslint-plugin-css-module-explainer",
    version: "0.0.1",
  },
  rules: {
    "missing-module": missingModuleRule,
    "missing-static-class": missingStaticClassRule,
    "missing-template-prefix": missingTemplatePrefixRule,
    "invalid-class-reference": invalidClassReferenceRule,
    "no-unknown-dynamic-class": noUnknownDynamicClassRule,
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
