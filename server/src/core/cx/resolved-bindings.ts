import ts from "typescript";
import type { CxBinding } from "@css-module-explainer/shared";
import type { SourceBinderResult } from "../binder/scope-types";
import { resolveIdentifierAtOffset } from "../binder/binder-builder";

export interface ResolvedCxBinding {
  readonly cxVarName: string;
  readonly stylesVarName: string;
  readonly scssModulePath: string;
  readonly classNamesImportName: string;
  readonly bindingDeclId: string;
}

export function resolveCxBindings(
  bindings: readonly CxBinding[],
  sourceBinder?: SourceBinderResult,
  sourceFile?: ts.SourceFile,
): readonly ResolvedCxBinding[] {
  return bindings.map((binding, index) => ({
    cxVarName: binding.cxVarName,
    stylesVarName: binding.stylesVarName,
    scssModulePath: binding.scssModulePath,
    classNamesImportName: binding.classNamesImportName,
    bindingDeclId: resolveBindingDeclId(binding, sourceBinder, sourceFile, index),
  }));
}

function resolveBindingDeclId(
  binding: CxBinding,
  sourceBinder: SourceBinderResult | undefined,
  sourceFile: ts.SourceFile | undefined,
  index: number,
): string {
  if (!sourceBinder || !sourceFile) {
    return `synthetic-binding-decl:${index}`;
  }

  const resolution = resolveIdentifierAtOffset(
    sourceBinder,
    binding.cxVarName,
    ts.getPositionOfLineAndCharacter(
      sourceFile,
      binding.bindingRange.start.line,
      binding.bindingRange.start.character,
    ),
  );
  return resolution?.declId ?? `synthetic-binding-decl:${index}`;
}
