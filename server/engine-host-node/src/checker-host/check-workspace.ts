import { checkSourceDocument } from "../../../src/core/checker/check-source-document";
import { checkStyleDocument } from "../../../src/core/checker/check-style-document";
import type { CheckerFinding, WorkspaceCheckerFinding } from "../../../src/core/checker/contracts";
import type { ClassnameTransformMode } from "../../../src/core/scss/classname-transform";
import {
  collectSourceDocuments,
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
  resolveWorkspaceCheckFiles,
} from "./workspace-check-support";

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

export async function checkWorkspace(
  options: WorkspaceCheckOptions,
): Promise<WorkspaceCheckResult> {
  const workspaceRoot = options.workspaceRoot;
  const classnameTransform = options.classnameTransform ?? "asIs";
  const pathAlias = options.pathAlias ?? {};
  const { sourceFiles, styleFiles } = await resolveWorkspaceCheckFiles({
    workspaceRoot,
    ...(options.sourceFilePaths ? { sourceFilePaths: options.sourceFilePaths } : {}),
    ...(options.styleFilePaths ? { styleFilePaths: options.styleFilePaths } : {}),
  });
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
  const sourceDocuments = collectSourceDocuments(sourceFiles, analysisHost.analysisCache);

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
        analysisCache: analysisHost.analysisCache,
        styleDocumentForPath: styleHost.styleDocumentForPath,
        typeResolver: analysisHost.typeResolver,
        workspaceRoot,
      },
      sourceCheckOptions,
    )) {
      findings.push({ filePath: document.filePath, finding });
    }
  }

  for (const styleFile of styleFiles) {
    const styleDocument = styleHost.styleDocumentForPath(styleFile);
    if (!styleDocument) continue;
    for (const finding of checkStyleDocument(
      {
        scssPath: styleFile,
        styleDocument,
      },
      {
        semanticReferenceIndex: analysisHost.semanticReferenceIndex,
        styleDependencyGraph: styleHost.styleDependencyGraph,
        styleDocumentForPath: styleHost.styleDocumentForPath,
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
