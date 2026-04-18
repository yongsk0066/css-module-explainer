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
  meta: {
    type: "problem",
    docs: {
      description: "Run CSS Module Explainer source-side semantic checks inside ESLint.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          workspaceRoot: { type: "string" },
          classnameTransform: {
            enum: ["asIs", "camelCase", "camelCaseOnly", "dashes", "dashesOnly"],
          },
          includeMissingModule: { type: "boolean" },
          pathAlias: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
    ],
  },

  create(context) {
    const filename = context.filename;
    if (!filename || filename === "<input>" || !path.isAbsolute(filename)) return {};
    if (!SOURCE_FILE_PATTERN.test(filename)) return {};

    return {
      "Program:exit"() {
        const options = context.options[0] ?? {};
        const workspaceRoot = resolveWorkspaceRoot(filename, options.workspaceRoot);
        const classnameTransform = options.classnameTransform ?? "asIs";
        const includeMissingModule = options.includeMissingModule ?? true;
        const pathAlias = options.pathAlias ?? {};
        const host = getWorkspaceHost({
          workspaceRoot,
          classnameTransform,
          pathAlias,
        });

        const findings = checkSourceDocument(
          {
            documentUri: pathToFileURL(filename).href,
            content: context.sourceCode.text,
            filePath: filename,
            version: 1,
          },
          {
            analysisCache: host.analysisHost.analysisCache,
            styleDocumentForPath: host.styleHost.styleDocumentForPath,
            typeResolver: host.analysisHost.typeResolver,
            workspaceRoot,
          },
          {
            includeMissingModule,
          },
        );

        for (const finding of findings) {
          context.report({
            loc: toEslintLoc(finding.range),
            message: formatCheckerFinding(finding, workspaceRoot),
          });
        }
      },
    };
  },
};

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
