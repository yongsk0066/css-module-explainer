import type { Diagnostic } from "vscode-languageserver/node";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { computeUnusedSelectorDiagnostics } from "../core/query/compute-unused-selectors";
import type { ReverseIndex } from "../core/indexing/reverse-index";
import type { SemanticWorkspaceReferenceIndex } from "../core/semantic/workspace-reference-index";

/**
 * Compute "unused selector" diagnostics for a single SCSS module file.
 *
 * The underlying query combines semantic reference counts with the
 * compatibility reverse index so diagnostics stay stable while the
 * query layer becomes the shared semantic entry point.
 *
 * Caller is responsible for gating behind IndexerWorker.ready so
 * this function is never called before the initial index walk
 * completes.
 */
export function computeScssUnusedDiagnostics(
  scssPath: string,
  classMap: ScssClassMap,
  reverseIndex: ReverseIndex,
  semanticReferenceIndex: SemanticWorkspaceReferenceIndex,
): Diagnostic[] {
  return computeUnusedSelectorDiagnostics(scssPath, classMap, reverseIndex, semanticReferenceIndex);
}
