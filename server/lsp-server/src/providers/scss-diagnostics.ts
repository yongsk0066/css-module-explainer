import { DiagnosticSeverity, DiagnosticTag, type Diagnostic } from "vscode-languageserver/node";
import { type StyleCheckerFinding } from "../../../engine-core-ts/src/core/checker";
import { formatCheckerFinding } from "../../../engine-core-ts/src/checker-surface";
import type { StyleDocumentHIR } from "../../../engine-core-ts/src/core/hir/style-types";
import { pathToFileUrl } from "../../../engine-core-ts/src/core/util/text-utils";
import {
  buildCreateKeyframesActionData,
  buildCreateSassSymbolActionData,
  buildCreateSelectorActionData,
  buildCreateValueActionData,
} from "../../../engine-host-node/src/code-action-data";
import { resolveStyleDiagnosticFindings } from "../../../engine-host-node/src/style-diagnostics-query";
import type { ProviderDeps } from "./provider-deps";
import { toLspRange } from "./lsp-adapters";

/**
 * Compute "unused selector" diagnostics for a single SCSS module file.
 *
 * Caller is responsible for gating behind IndexerWorker.ready so
 * this function is never called before the initial index walk
 * completes.
 */
export function computeScssUnusedDiagnostics(
  scssPath: string,
  styleDocument: StyleDocumentHIR,
  semanticReferenceIndex: ProviderDeps["semanticReferenceIndex"],
  styleDependencyGraph?: ProviderDeps["styleDependencyGraph"],
  styleDocumentForPath?: (filePath: string) => StyleDocumentHIR | null,
  runtimeDeps?: Pick<
    ProviderDeps,
    "analysisCache" | "typeResolver" | "workspaceRoot" | "settings"
  > & {
    readonly env?: NodeJS.ProcessEnv;
  },
): Diagnostic[] {
  return resolveStyleDiagnosticFindings(
    { scssPath, styleDocument },
    {
      ...(runtimeDeps?.analysisCache ? { analysisCache: runtimeDeps.analysisCache } : {}),
      semanticReferenceIndex,
      ...(styleDependencyGraph ? { styleDependencyGraph } : {}),
      ...(styleDocumentForPath ? { styleDocumentForPath } : {}),
      ...(runtimeDeps?.typeResolver ? { typeResolver: runtimeDeps.typeResolver } : {}),
      ...(runtimeDeps?.workspaceRoot ? { workspaceRoot: runtimeDeps.workspaceRoot } : {}),
      ...(runtimeDeps?.settings ? { settings: runtimeDeps.settings } : {}),
    },
    runtimeDeps?.env ? { env: runtimeDeps.env } : undefined,
  ).map((finding) => toDiagnostic(finding, styleDocument, styleDocumentForPath));
}

function toDiagnostic(
  finding: StyleCheckerFinding,
  styleDocument: StyleDocumentHIR,
  styleDocumentForPath?: (filePath: string) => StyleDocumentHIR | null,
): Diagnostic {
  switch (finding.code) {
    case "unused-selector":
      return {
        range: toLspRange(finding.range),
        severity: DiagnosticSeverity.Hint,
        source: "css-module-explainer",
        message: formatCheckerFinding(finding, ""),
        tags: [DiagnosticTag.Unnecessary],
      };
    case "missing-composed-module":
      return {
        range: toLspRange(finding.range),
        severity: DiagnosticSeverity.Warning,
        source: "css-module-explainer",
        message: formatCheckerFinding(finding, ""),
        data: {
          createModuleFile: {
            uri: pathToFileUrl(finding.targetFilePath),
          },
        },
      };
    case "missing-composed-selector": {
      const targetDocument = styleDocumentForPath?.(finding.targetFilePath);
      const data = targetDocument
        ? {
            createSelector: buildCreateSelectorActionData(
              finding.className,
              finding.targetFilePath,
              targetDocument,
            ),
          }
        : {};
      return {
        range: toLspRange(finding.range),
        severity: DiagnosticSeverity.Warning,
        source: "css-module-explainer",
        message: formatCheckerFinding(finding, ""),
        data,
      };
    }
    case "missing-value-module":
      return {
        range: toLspRange(finding.range),
        severity: DiagnosticSeverity.Warning,
        source: "css-module-explainer",
        message: formatCheckerFinding(finding, ""),
        data: {
          createModuleFile: {
            uri: pathToFileUrl(finding.targetFilePath),
          },
        },
      };
    case "missing-imported-value":
      const targetDocument = styleDocumentForPath?.(finding.targetFilePath);
      const data = targetDocument
        ? {
            createValue: buildCreateValueActionData(
              finding.importedName,
              finding.targetFilePath,
              targetDocument,
            ),
          }
        : {};
      return {
        range: toLspRange(finding.range),
        severity: DiagnosticSeverity.Warning,
        source: "css-module-explainer",
        message: formatCheckerFinding(finding, ""),
        data,
      };
    case "missing-keyframes":
      return {
        range: toLspRange(finding.range),
        severity: DiagnosticSeverity.Warning,
        source: "css-module-explainer",
        message: formatCheckerFinding(finding, ""),
        data: {
          createKeyframes: buildCreateKeyframesActionData(
            finding.animationName,
            finding.selectorFilePath,
            styleDocument,
          ),
        },
      };
    case "missing-sass-symbol":
      return {
        range: toLspRange(finding.range),
        severity: DiagnosticSeverity.Warning,
        source: "css-module-explainer",
        message: formatCheckerFinding(finding, ""),
        data: {
          createSassSymbol: buildCreateSassSymbolActionData(
            finding.symbolKind,
            finding.symbolName,
            finding.selectorFilePath,
            styleDocument,
          ),
        },
      };
    default:
      finding satisfies never;
      return finding;
  }
}
