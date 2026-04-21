import path from "node:path";
import { ESLint } from "eslint";

const REPO_ROOT = process.cwd();
const EXAMPLE_ROOT = path.join(REPO_ROOT, "examples/plugin-consumers");
const ESLINT_CONFIG_PATH = path.join(EXAMPLE_ROOT, "eslint.config.mjs");
const SOURCE_FILE_PATH = path.join(EXAMPLE_ROOT, "src/App.jsx");

async function main(): Promise<void> {
  const eslintConfig = (await import(ESLINT_CONFIG_PATH)).default;
  const eslint = new ESLint({
    cwd: EXAMPLE_ROOT,
    ignore: false,
    overrideConfigFile: true,
    overrideConfig: eslintConfig,
  });

  const [result] = await eslint.lintFiles([SOURCE_FILE_PATH]);
  if (!result) {
    throw new Error("ESLint example returned no results.");
  }
  if (result.messages.length !== 0) {
    throw new Error(
      `Expected clean ESLint example, got ${result.messages.length} messages: ${result.messages.map((message) => message.message).join(" | ")}`,
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
