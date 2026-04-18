import path from "node:path";
import stylelint from "stylelint";

const REPO_ROOT = process.cwd();
const WORKSPACE_ROOT = path.join(REPO_ROOT, "test/_fixtures/stylelint-plugin-smoke");
const STYLE_FILE_PATH = path.join(WORKSPACE_ROOT, "src/App.module.css");
const PLUGIN_NAME = "stylelint-plugin-css-module-explainer";

async function main() {
  const result = await stylelint.lint({
    files: [STYLE_FILE_PATH],
    configBasedir: REPO_ROOT,
    config: {
      extends: [`${PLUGIN_NAME}/recommended`],
      rules: {
        "css-module-explainer/unused-selector": [
          true,
          {
            workspaceRoot: WORKSPACE_ROOT,
          },
        ],
      },
    },
  });

  const [fileResult] = result.results;
  if (!fileResult) {
    throw new Error("Stylelint returned no results.");
  }
  if (fileResult.warnings.length !== 1) {
    throw new Error(`Expected 1 unused-selector warning, got ${fileResult.warnings.length}.`);
  }
  const [warning] = fileResult.warnings;
  if (!warning || !warning.text.includes("Selector '.ghost' is declared but never used.")) {
    throw new Error(`Unexpected stylelint warning: ${warning?.text ?? "<missing>"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
