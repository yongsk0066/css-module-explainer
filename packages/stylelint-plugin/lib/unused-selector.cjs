const stylelint = require("stylelint");
const {
  STYLE_MODULE_FILE_PATTERN,
  getRuleOptions,
  offsetForRangePosition,
  runStyleChecks,
} = require("./_shared.cjs");

const ruleName = "css-module-explainer/unused-selector";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (selectorName) => `Selector '.${selectorName}' is declared but never used.`,
});

const ruleFunction = (primary, secondaryOptions = {}) => {
  return (root, result) => {
    const valid = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    });
    if (!valid) return;

    const filePath = root.source?.input?.file;
    if (!filePath || !STYLE_MODULE_FILE_PATTERN.test(filePath)) return;
    const sourceText = root.source?.input?.css ?? root.toString();

    const ruleOptions = getRuleOptions(filePath, secondaryOptions);
    const findings = runStyleChecks(filePath, ruleOptions).filter(
      (finding) => finding.code === "unused-selector",
    );

    for (const finding of findings) {
      stylelint.utils.report({
        result,
        ruleName,
        message: finding.message,
        node: root,
        index: offsetForRangePosition(sourceText, finding.range.start),
        endIndex: offsetForRangePosition(sourceText, finding.range.end),
      });
    }
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
