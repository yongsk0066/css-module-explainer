import path from "node:path";
import { ESLint } from "eslint";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plugin = require("../packages/eslint-plugin");

const REPO_ROOT = process.cwd();
const WORKSPACE_ROOT = path.join(REPO_ROOT, "test/_fixtures/eslint-plugin-smoke");
const FILE_PATH = path.join(WORKSPACE_ROOT, "src/App.jsx");

async function main(): Promise<void> {
  const eslint = new ESLint({
    cwd: WORKSPACE_ROOT,
    ignore: false,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{js,jsx}"],
        languageOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          parserOptions: {
            ecmaFeatures: { jsx: true },
          },
        },
        plugins: {
          "css-module-explainer": plugin,
        },
        rules: {
          "css-module-explainer/source-check": "error",
        },
      },
    ],
  });

  const [result] = await eslint.lintFiles([FILE_PATH]);
  if (!result) {
    throw new Error("ESLint returned no results.");
  }
  if (result.messages.length !== 1) {
    throw new Error(`Expected 1 message, got ${result.messages.length}.`);
  }
  const [message] = result.messages;
  if (!message || !message.message.includes("Class '.ghost' not found")) {
    throw new Error(`Unexpected ESLint message: ${message?.message ?? "<missing>"}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
