module.exports = {
  plugins: ["stylelint-plugin-css-module-explainer"],
  rules: {
    "css-module-explainer/unused-selector": [true],
    "css-module-explainer/missing-composed-module": [true],
    "css-module-explainer/missing-composed-selector": [true],
  },
};
