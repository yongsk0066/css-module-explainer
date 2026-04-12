const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.cjs");
  const workspacePath = path.resolve(__dirname, "fixtures", "basic");

  await runTests({
    extensionDevelopmentPath: repoRoot,
    extensionTestsPath,
    launchArgs: [workspacePath, "--disable-extensions"],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
