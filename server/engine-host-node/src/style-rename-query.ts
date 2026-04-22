import {
  planSelectorRename,
  readStyleSelectorRenameTargetAtCursor,
} from "../../engine-core-ts/src/core/rewrite";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export function readStyleRenameTargetAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    "settings" | "semanticReferenceIndex" | "styleDependencyGraph" | "styleDocumentForPath"
  >,
) {
  return readStyleSelectorRenameTargetAtCursor(filePath, line, character, styleDocument, deps);
}

export function planStyleRenameAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    "settings" | "semanticReferenceIndex" | "styleDependencyGraph" | "styleDocumentForPath"
  >,
  newName: string,
) {
  const result = readStyleRenameTargetAtCursor(filePath, line, character, styleDocument, deps);
  if (result.kind !== "target") return null;
  return planSelectorRename(result.target, newName);
}
