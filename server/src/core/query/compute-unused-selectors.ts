import type { Range } from "@css-module-explainer/shared";
import type { StyleDocumentHIR } from "../hir/style-types";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";
import { readStyleModuleUsageSummary } from "./read-style-module-usage";

export interface UnusedSelectorFinding {
  readonly canonicalName: string;
  readonly range: Range;
}

export function findUnusedSelectors(
  scssPath: string,
  styleDocument: StyleDocumentHIR,
  semanticReferenceIndex: SemanticWorkspaceReferenceIndex,
): readonly UnusedSelectorFinding[] {
  return readStyleModuleUsageSummary(
    scssPath,
    styleDocument,
    semanticReferenceIndex,
  ).unusedSelectors.map((selector) => ({
    canonicalName: selector.canonicalName,
    range: selector.range,
  }));
}
