const path = require("node:path");
const { execFileSync } = require("node:child_process");

const STYLE_MODULE_FILE_PATTERN = /\.module\.(css|scss|less)$/;
const REPO_ROOT = path.resolve(__dirname, "../../../");

module.exports = {
  STYLE_MODULE_FILE_PATTERN,
  getRuleOptions,
  offsetForRangePosition,
  runStyleChecks,
};

function getRuleOptions(filePath, secondaryOptions = {}) {
  return {
    workspaceRoot: resolveWorkspaceRoot(filePath, secondaryOptions.workspaceRoot),
    classnameTransform: secondaryOptions.classnameTransform ?? "asIs",
    pathAlias: secondaryOptions.pathAlias ?? {},
  };
}

function runStyleChecks(filePath, ruleOptions) {
  const args = [
    "--silent",
    "check:workspace",
    "--",
    ruleOptions.workspaceRoot,
    "--category",
    "style",
    "--severity",
    "all",
    "--include-code",
    "unused-selector",
    "--format",
    "json",
    "--fail-on",
    "none",
    "--classname-transform",
    ruleOptions.classnameTransform,
  ];

  for (const [key, value] of Object.entries(ruleOptions.pathAlias)) {
    args.push("--path-alias", `${key}=${value}`);
  }

  const stdout = execFileSync("pnpm", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const report = JSON.parse(stdout);
  return (report.findings ?? []).filter((finding) => finding.filePath === filePath);
}

function resolveWorkspaceRoot(filePath, configuredRoot) {
  if (configuredRoot) return path.resolve(configuredRoot);
  return path.dirname(filePath);
}

function offsetForRangePosition(sourceText, position) {
  let line = 0;
  let offset = 0;

  while (line < position.line && offset < sourceText.length) {
    const nextNewline = sourceText.indexOf("\n", offset);
    if (nextNewline === -1) return sourceText.length;
    offset = nextNewline + 1;
    line += 1;
  }

  return Math.min(offset + position.character, sourceText.length);
}
