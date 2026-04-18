import {
  DiagnosticSeverity,
  type Diagnostic,
  type Range as LspRange,
} from "vscode-languageserver/node";
import {
  checkSourceDocument,
  type SourceCheckerFinding,
} from "../../../engine-core-ts/src/core/checker";
import { formatCheckerFinding } from "../../../engine-core-ts/src/checker-surface";
import { pathToFileUrl } from "../../../engine-core-ts/src/core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { buildCreateSelectorActionData } from "./code-action-data";
import { wrapHandler } from "./_wrap-handler";
import type { DocumentParams, ProviderDeps } from "./provider-deps";

/**
 * Compute diagnostics for an open document.
 *
 * Push-based: the composition root calls this on
 * `onDidChangeContent` (debounced) and pipes the result into
 * `connection.sendDiagnostics(...)`.
 *
 * Iterates every cached class expression whose origin is `cxCall` in the
 * document's analysis entry, classifies each, and emits a
 * Diagnostic for unresolved / missing class names. Returns [] for
 * clean documents — caller MUST still publish to clear prior
 * warnings.
 *
 * Error isolation is owned by `wrapHandler` at the entry level;
 * per-ref validation failures are caught inside so a single bad
 * ref cannot erase sibling diagnostics.
 */
export const computeDiagnostics = wrapHandler<
  DocumentParams,
  [severity?: DiagnosticSeverity],
  Diagnostic[]
>(
  "diagnostics",
  (params, deps, severity: DiagnosticSeverity = DiagnosticSeverity.Warning) => {
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
    ).map((finding) => toDiagnostic(finding, deps, severity));
  },
  [],
);

const DIAGNOSTIC_SOURCE = "css-module-explainer";

function toDiagnostic(
  finding: SourceCheckerFinding,
  deps: ProviderDeps,
  severity: DiagnosticSeverity,
): Diagnostic {
  const range: LspRange = toLspRange(finding.range);

  switch (finding.code) {
    case "missing-static-class": {
      const styleDocument = deps.styleDocumentForPath(finding.scssModulePath);
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: formatCheckerFinding(finding, deps.workspaceRoot),
        data: {
          ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
          ...(styleDocument
            ? {
                createSelector: buildCreateSelectorActionData(
                  finding.className,
                  finding.scssModulePath,
                  styleDocument,
                ),
              }
            : {}),
        },
      };
    }
    case "missing-template-prefix":
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: formatCheckerFinding(finding, deps.workspaceRoot),
      };
    case "missing-resolved-class-values":
    case "missing-resolved-class-domain":
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: formatCheckerFinding(finding, deps.workspaceRoot),
      };
    case "missing-module":
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: formatCheckerFinding(finding, deps.workspaceRoot),
        code: "missing-module",
        data: {
          createModuleFile: {
            uri: pathToFileUrl(finding.absolutePath),
          },
        },
      };
    default:
      finding satisfies never;
      return finding;
  }
}
