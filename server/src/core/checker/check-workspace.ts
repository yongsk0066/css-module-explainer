import { existsSync, readFileSync } from "node:fs";
import fastGlob from "fast-glob";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ClassnameTransformMode } from "../scss/classname-transform";
import { buildStyleFileWatcherGlob, findLangForPath } from "../scss/lang-registry";
import { StyleIndexCache } from "../scss/scss-index";
import { checkSourceDocument } from "./check-source-document";
import { checkStyleDocument } from "./check-style-document";
import type { CheckerFinding, WorkspaceCheckerFinding } from "./contracts";
import { SourceFileCache } from "../ts/source-file-cache";
import { DocumentAnalysisCache } from "../indexing/document-analysis-cache";
import { AliasResolver, loadWorkspaceTsconfigPathAliases } from "../cx/alias-resolver";
import { detectClassUtilImports, scanCxImports } from "../cx/binding-detector";
import { parseClassExpressions } from "../cx/class-ref-parser";
import { WorkspaceTypeResolver } from "../ts/type-resolver";
import { createDefaultProgram } from "../ts/default-program";
import { collectSemanticReferenceContribution } from "../semantic/reference-collector";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";
import { WorkspaceStyleDependencyGraph } from "../semantic/style-dependency-graph";
import type { StyleDocumentHIR } from "../hir/style-types";

export interface WorkspaceCheckOptions {
  readonly workspaceRoot: string;
  readonly classnameTransform?: ClassnameTransformMode;
  readonly pathAlias?: Readonly<Record<string, string>>;
  readonly includeMissingModule?: boolean;
  readonly includeUnusedSelectors?: boolean;
  readonly includeComposesResolution?: boolean;
  readonly sourceFilePaths?: readonly string[];
  readonly styleFilePaths?: readonly string[];
}

export interface WorkspaceCheckSummary {
  readonly warnings: number;
  readonly hints: number;
  readonly total: number;
}

export interface WorkspaceCheckResult {
  readonly sourceFiles: readonly string[];
  readonly styleFiles: readonly string[];
  readonly findings: readonly WorkspaceCheckerFinding[];
  readonly summary: WorkspaceCheckSummary;
}

const SOURCE_GLOB = "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}";
const DEFAULT_IGNORES = ["**/node_modules/**", "**/dist/**", "**/.git/**"] as const;

export async function checkWorkspace(
  options: WorkspaceCheckOptions,
): Promise<WorkspaceCheckResult> {
  const workspaceRoot = options.workspaceRoot;
  const classnameTransform = options.classnameTransform ?? "asIs";
  const pathAlias = options.pathAlias ?? {};
  const aliasResolver = new AliasResolver(
    workspaceRoot,
    pathAlias,
    loadWorkspaceTsconfigPathAliases(workspaceRoot),
  );
  const sourceFileCache = new SourceFileCache({ max: 500 });
  const styleIndexCache = new StyleIndexCache({ max: 1000 });
  const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
  const styleDependencyGraph = new WorkspaceStyleDependencyGraph();
  const typeResolver = new WorkspaceTypeResolver({ createProgram: createDefaultProgram });
  const styleContents = new Map<string, string>();

  const sourceFiles = (
    options.sourceFilePaths ?? (await collectWorkspaceFiles(workspaceRoot, SOURCE_GLOB))
  ).toSorted();
  const styleFiles = (
    options.styleFilePaths ??
    (await collectWorkspaceFiles(workspaceRoot, buildStyleFileWatcherGlob()))
  )
    .filter((filePath) => findLangForPath(filePath) !== null)
    .toSorted();

  const styleDocumentForPath = (filePath: string): StyleDocumentHIR | null => {
    if (!findLangForPath(filePath)) return null;
    const content = readStyleFile(filePath);
    if (content === null) return null;
    const styleDocument = styleIndexCache.getStyleDocument(filePath, content, classnameTransform);
    styleDependencyGraph.record(filePath, styleDocument);
    return styleDocument;
  };

  function readStyleFile(filePath: string): string | null {
    const cached = styleContents.get(filePath);
    if (cached !== undefined) return cached;
    try {
      const content = readFileSync(filePath, "utf8");
      styleContents.set(filePath, content);
      return content;
    } catch {
      return null;
    }
  }

  for (const styleFile of styleFiles) {
    styleDocumentForPath(styleFile);
  }

  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    scanCxImports,
    parseClassExpressions,
    detectClassUtilImports,
    fileExists: existsSync,
    aliasResolver,
    max: 500,
    onAnalyze: (uri, entry) => {
      const contribution = collectSemanticReferenceContribution(uri, entry, {
        styleDocumentForPath,
        typeResolver,
        workspaceRoot,
        filePath: fileURLToPath(uri),
        settingsKey: workspaceSettingsKey(classnameTransform, pathAlias),
      });
      semanticReferenceIndex.record(
        uri,
        contribution.referenceSites,
        contribution.moduleUsages,
        contribution.deps,
      );
    },
  });

  const sourceDocuments = sourceFiles.map((filePath) => {
    const content = readFileSync(filePath, "utf8");
    const uri = pathToFileURL(filePath).href;
    const version = 1;
    analysisCache.get(uri, content, filePath, version);
    return { uri, filePath, content, version } as const;
  });

  const findings: WorkspaceCheckerFinding[] = [];
  const sourceCheckOptions =
    options.includeMissingModule !== undefined
      ? { includeMissingModule: options.includeMissingModule }
      : {};
  const styleCheckOptions: {
    includeUnusedSelectors?: boolean;
    includeComposesResolution?: boolean;
  } = {};
  if (options.includeUnusedSelectors !== undefined) {
    styleCheckOptions.includeUnusedSelectors = options.includeUnusedSelectors;
  }
  if (options.includeComposesResolution !== undefined) {
    styleCheckOptions.includeComposesResolution = options.includeComposesResolution;
  }

  for (const document of sourceDocuments) {
    for (const finding of checkSourceDocument(
      {
        documentUri: document.uri,
        content: document.content,
        filePath: document.filePath,
        version: document.version,
      },
      {
        analysisCache,
        styleDocumentForPath,
        typeResolver,
        workspaceRoot,
      },
      sourceCheckOptions,
    )) {
      findings.push({ filePath: document.filePath, finding });
    }
  }

  for (const styleFile of styleFiles) {
    const styleDocument = styleDocumentForPath(styleFile);
    if (!styleDocument) continue;
    for (const finding of checkStyleDocument(
      {
        scssPath: styleFile,
        styleDocument,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph,
        styleDocumentForPath,
      },
      styleCheckOptions,
    )) {
      findings.push({ filePath: styleFile, finding });
    }
  }

  const sortedFindings = findings.toSorted(compareWorkspaceFindings);
  const summary = summarizeFindings(sortedFindings.map((entry) => entry.finding));

  return {
    sourceFiles,
    styleFiles,
    findings: sortedFindings,
    summary,
  };
}

async function collectWorkspaceFiles(
  workspaceRoot: string,
  pattern: string,
): Promise<readonly string[]> {
  return fastGlob(pattern, {
    cwd: workspaceRoot,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: [...DEFAULT_IGNORES],
  });
}

function workspaceSettingsKey(
  classnameTransform: ClassnameTransformMode,
  pathAlias: Readonly<Record<string, string>>,
): string {
  const aliases = Object.entries(pathAlias)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
  return `transform:${classnameTransform};alias:${aliases}`;
}

function compareWorkspaceFindings(a: WorkspaceCheckerFinding, b: WorkspaceCheckerFinding): number {
  return (
    a.filePath.localeCompare(b.filePath) ||
    a.finding.range.start.line - b.finding.range.start.line ||
    a.finding.range.start.character - b.finding.range.start.character ||
    a.finding.code.localeCompare(b.finding.code)
  );
}

function summarizeFindings(findings: readonly CheckerFinding[]): WorkspaceCheckSummary {
  let warnings = 0;
  let hints = 0;
  for (const finding of findings) {
    if (finding.severity === "warning") warnings += 1;
    if (finding.severity === "hint") hints += 1;
  }
  return {
    warnings,
    hints,
    total: findings.length,
  };
}
