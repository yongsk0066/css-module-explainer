import { DiagnosticSeverity, DiagnosticTag, type Diagnostic } from "vscode-languageserver/node";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import { findUnusedSelectors } from "../core/query/compute-unused-selectors";
import type { SemanticWorkspaceReferenceIndex } from "../core/semantic/workspace-reference-index";

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
): Diagnostic[] {
  return findUnusedSelectors(scssPath, styleDocument, semanticReferenceIndex).map((finding) => ({
    range: toLspRange(finding.range),
    severity: DiagnosticSeverity.Hint,
    source: "css-module-explainer",
    message: `Selector '.${finding.canonicalName}' is declared but never used.`,
    tags: [DiagnosticTag.Unnecessary],
  }));
}

function toLspRange(range: {
  readonly start: { readonly line: number; readonly character: number };
  readonly end: { readonly line: number; readonly character: number };
}): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}
