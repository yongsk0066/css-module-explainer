import path from "node:path";
import { ESLint } from "eslint";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plugin = require("eslint-plugin-css-module-explainer");

const REPO_ROOT = process.cwd();
const WORKSPACE_ROOT = path.join(REPO_ROOT, "test/_fixtures/eslint-plugin-smoke");
const INVALID_CLASS_FILE_PATH = path.join(WORKSPACE_ROOT, "src/App.jsx");
const DYNAMIC_CLASS_FILE_PATH = path.join(WORKSPACE_ROOT, "src/Dynamic.jsx");
const MISSING_MODULE_FILE_PATH = path.join(WORKSPACE_ROOT, "src/MissingModule.jsx");

async function main(): Promise<void> {
  await assertInvalidClassReferenceRule();
  await assertNoUnknownDynamicClassRule();
  await assertMissingModuleRule();
}

async function assertInvalidClassReferenceRule(): Promise<void> {
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
          "css-module-explainer/invalid-class-reference": "error",
        },
      },
    ],
  });

  const [result] = await eslint.lintFiles([INVALID_CLASS_FILE_PATH]);
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

async function assertNoUnknownDynamicClassRule(): Promise<void> {
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
          "css-module-explainer/no-unknown-dynamic-class": "error",
        },
      },
    ],
  });

  const [result] = await eslint.lintFiles([DYNAMIC_CLASS_FILE_PATH]);
  if (!result) {
    throw new Error("ESLint returned no results.");
  }
  if (result.messages.length !== 1) {
    throw new Error(`Expected 1 no-unknown-dynamic-class message, got ${result.messages.length}.`);
  }
  const [message] = result.messages;
  if (!message || !message.message.includes("Missing class for possible value: 'ghost'")) {
    throw new Error(
      `Unexpected no-unknown-dynamic-class message: ${message?.message ?? "<missing>"}`,
    );
  }
}

async function assertMissingModuleRule(): Promise<void> {
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
          "css-module-explainer/missing-module": "error",
        },
      },
    ],
  });

  const [result] = await eslint.lintFiles([MISSING_MODULE_FILE_PATH]);
  if (!result) {
    throw new Error("ESLint returned no results.");
  }
  if (result.messages.length !== 1) {
    throw new Error(`Expected 1 missing-module message, got ${result.messages.length}.`);
  }
  const [message] = result.messages;
  if (!message || !message.message.includes("Cannot resolve CSS Module './Missing.module.scss'")) {
    throw new Error(`Unexpected missing-module message: ${message?.message ?? "<missing>"}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
