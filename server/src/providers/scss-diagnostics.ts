import { DiagnosticSeverity, DiagnosticTag, type Diagnostic } from "vscode-languageserver/node";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import { readStyleModuleUsageSummary } from "../core/query/read-style-module-usage";
import type { SemanticWorkspaceReferenceIndex } from "../core/semantic/workspace-reference-index";
import type { StyleDependencyGraph } from "../core/semantic/style-dependency-graph";
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
  semanticReferenceIndex: SemanticWorkspaceReferenceIndex,
  styleDependencyGraph?: StyleDependencyGraph,
): Diagnostic[] {
  return readStyleModuleUsageSummary(
    scssPath,
    styleDocument,
    semanticReferenceIndex,
    styleDependencyGraph,
  ).unusedSelectors.map((finding) => ({
    range: toLspRange(finding.range),
    severity: DiagnosticSeverity.Hint,
    source: "css-module-explainer",
    message: `Selector '.${finding.canonicalName}' is declared but never used.`,
    tags: [DiagnosticTag.Unnecessary],
  }));
}
