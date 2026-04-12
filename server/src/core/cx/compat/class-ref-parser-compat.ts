import type ts from "typescript";
import type { ClassRef, CxBinding, StyleImport } from "@css-module-explainer/shared";
import { classExpressionToLegacyClassRef } from "../../hir/compat/source-document-compat";
import { parseClassExpressions } from "../class-ref-parser";

export function parseClassRefs(
  sourceFile: ts.SourceFile,
  bindings: readonly CxBinding[],
  stylesBindings: ReadonlyMap<string, StyleImport>,
): ClassRef[] {
  return parseClassExpressions(sourceFile, bindings, stylesBindings).map(
    classExpressionToLegacyClassRef,
  );
}
