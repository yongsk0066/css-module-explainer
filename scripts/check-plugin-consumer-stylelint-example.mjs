import path from "node:path";
import stylelint from "stylelint";

const REPO_ROOT = process.cwd();
const EXAMPLE_ROOT = path.join(REPO_ROOT, "examples/plugin-consumers");
const STYLELINT_CONFIG_PATH = path.join(EXAMPLE_ROOT, "stylelint.config.mjs");
const STYLE_FILE_PATH = path.join(EXAMPLE_ROOT, "src/App.module.scss");

async function main() {
  const stylelintConfig = (await import(STYLELINT_CONFIG_PATH)).default;
  const result = await stylelint.lint({
    files: [STYLE_FILE_PATH],
    configBasedir: REPO_ROOT,
    config: stylelintConfig,
  });

  const warnings = result.results.flatMap((fileResult) => fileResult.warnings);
  if (warnings.length !== 0) {
    throw new Error(
      `Expected clean Stylelint example, got ${warnings.length} warnings: ${warnings.map((warning) => warning.text).join(" | ")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
