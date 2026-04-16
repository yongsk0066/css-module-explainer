import {
  collectSourceDocuments,
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
  resolveWorkspaceCheckFiles,
} from "../server/engine-host-node/src/checker-host/workspace-check-support";
import { runWorkspaceCheckCommand } from "../server/engine-host-node/src/checker-host";
import { buildCheckerEngineParitySnapshotV1 } from "../server/engine-host-node/src/engine-parity-v1";
import { CONTRACT_PARITY_CORPUS } from "./contract-parity-corpus";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS) {
    process.stdout.write(`== ${entry.label} ==\n`);

    // Sequential output is easier to inspect for parity-smoke failures than
    // interleaved batch logs.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const { sourceFiles, styleFiles } = await resolveWorkspaceCheckFiles({
      workspaceRoot: entry.workspace.workspaceRoot,
      ...(entry.workspace.sourceFilePaths
        ? { sourceFilePaths: entry.workspace.sourceFilePaths }
        : {}),
      ...(entry.workspace.styleFilePaths ? { styleFilePaths: entry.workspace.styleFilePaths } : {}),
    });

    const styleHost = createWorkspaceStyleHost({
      styleFiles,
      classnameTransform: entry.workspace.classnameTransform ?? "asIs",
    });
    styleHost.preloadStyleDocuments();
    const analysisHost = createWorkspaceAnalysisHost({
      workspaceRoot: entry.workspace.workspaceRoot,
      classnameTransform: entry.workspace.classnameTransform ?? "asIs",
      pathAlias: entry.workspace.pathAlias ?? {},
      styleDocumentForPath: styleHost.styleDocumentForPath,
    });
    const sourceDocuments = collectSourceDocuments(sourceFiles, analysisHost.analysisCache);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const command = await runWorkspaceCheckCommand({
      workspace: entry.workspace,
      filters: entry.filters,
    });
    const snapshot = buildCheckerEngineParitySnapshotV1({
      workspaceRoot: entry.workspace.workspaceRoot,
      classnameTransform: entry.workspace.classnameTransform ?? "asIs",
      pathAlias: entry.workspace.pathAlias ?? {},
      sourceDocuments,
      styleFiles,
      analysisCache: analysisHost.analysisCache,
      styleDocumentForPath: styleHost.styleDocumentForPath,
      typeResolver: analysisHost.typeResolver,
      semanticReferenceIndex: analysisHost.semanticReferenceIndex,
      styleDependencyGraph: styleHost.styleDependencyGraph,
      checkerReport: command.checkerReport,
    });

    process.stdout.write(
      `input: ${snapshot.input.sources.length} sources, ${snapshot.input.styles.length} styles, ${snapshot.input.typeFacts.length} type facts\n`,
    );
    process.stdout.write(
      `output: ${snapshot.output.queryResults.length} query results, ${snapshot.output.checkerReport.summary.total} findings\n\n`,
    );
  }
})();
