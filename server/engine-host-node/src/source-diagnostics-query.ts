import {
  checkSourceDocument,
  type SourceCheckerFinding,
} from "../../engine-core-ts/src/core/checker";
import type { DocumentParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export function resolveSourceDiagnosticFindings(
  params: DocumentParams,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "settings"
    | "logError"
  >,
): readonly SourceCheckerFinding[] {
  return checkSourceDocument(
    params,
    {
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      workspaceRoot: deps.workspaceRoot,
    },
    {
      includeMissingModule: deps.settings.diagnostics.missingModule,
      logError: deps.logError,
    },
  );
}
