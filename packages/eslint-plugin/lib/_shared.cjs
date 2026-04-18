const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fastGlob = require("fast-glob");
const {
  buildStyleFileWatcherGlob,
  findLangForPath,
} = require("../../../server/engine-core-ts/dist/core/scss/lang-registry.js");
const {
  checkSourceDocument,
} = require("../../../server/engine-core-ts/dist/core/checker/check-source-document.js");
const {
  formatCheckerFinding,
} = require("../../../server/engine-core-ts/dist/checker-surface/format-checker-finding.js");
const {
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
} = require("../../../server/engine-host-node/dist/checker-host/workspace-check-support.js");

const DEFAULT_IGNORES = ["**/node_modules/**", "**/dist/**", "**/.git/**"];
const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const HOST_CACHE = new Map();

module.exports = {
  SOURCE_FILE_PATTERN,
  formatCheckerFinding,
  getRuleOptions,
  getWorkspaceHost,
  resolveWorkspaceRoot,
  runSourceChecks,
  toEslintLoc,
};

function getRuleOptions(context) {
  const options = context.options[0] ?? {};
  const workspaceRoot = resolveWorkspaceRoot(context.filename, options.workspaceRoot);
  return {
    workspaceRoot,
    classnameTransform: options.classnameTransform ?? "asIs",
    includeMissingModule: options.includeMissingModule ?? true,
    pathAlias: options.pathAlias ?? {},
  };
}

function runSourceChecks(context, ruleOptions) {
  const host = getWorkspaceHost(ruleOptions);
  return checkSourceDocument(
    {
      documentUri: pathToFileURL(context.filename).href,
      content: context.sourceCode.text,
      filePath: context.filename,
      version: 1,
    },
    {
      analysisCache: host.analysisHost.analysisCache,
      styleDocumentForPath: host.styleHost.styleDocumentForPath,
      typeResolver: host.analysisHost.typeResolver,
      workspaceRoot: ruleOptions.workspaceRoot,
    },
    {
      includeMissingModule: ruleOptions.includeMissingModule,
    },
  );
}

function getWorkspaceHost({ workspaceRoot, classnameTransform, pathAlias }) {
  const cacheKey = JSON.stringify({
    workspaceRoot,
    classnameTransform,
    pathAlias: Object.entries(pathAlias).toSorted(([a], [b]) => a.localeCompare(b)),
  });
  const cached = HOST_CACHE.get(cacheKey);
  if (cached) return cached;

  const styleFiles = fastGlob
    .sync(buildStyleFileWatcherGlob(), {
      cwd: workspaceRoot,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: DEFAULT_IGNORES,
    })
    .filter((filePath) => findLangForPath(filePath) !== null)
    .toSorted();

  const styleHost = createWorkspaceStyleHost({
    styleFiles,
    classnameTransform,
  });
  styleHost.preloadStyleDocuments();
  const analysisHost = createWorkspaceAnalysisHost({
    workspaceRoot,
    classnameTransform,
    pathAlias,
    styleDocumentForPath: styleHost.styleDocumentForPath,
  });

  const host = { styleHost, analysisHost };
  HOST_CACHE.set(cacheKey, host);
  return host;
}

function resolveWorkspaceRoot(filePath, configuredRoot) {
  if (configuredRoot) return path.resolve(configuredRoot);
  let current = path.dirname(filePath);
  while (true) {
    if (
      fs.existsSync(path.join(current, "tsconfig.json")) ||
      fs.existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.dirname(filePath);
    current = parent;
  }
}

function toEslintLoc(range) {
  return {
    start: {
      line: range.start.line + 1,
      column: range.start.character,
    },
    end: {
      line: range.end.line + 1,
      column: range.end.character,
    },
  };
}
