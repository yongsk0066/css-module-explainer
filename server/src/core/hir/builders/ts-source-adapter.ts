import ts from "typescript";
import type { CxBinding, StyleImport } from "@css-module-explainer/shared";
import type { SourceBinderResult } from "../../binder/scope-types";
import { resolveIdentifierAtOffset } from "../../binder/binder-builder";
import {
  makeClassUtilBinding,
  makeSourceDocumentHIR,
  makeStyleImportBinding,
  type ClassExpressionHIR,
  type SourceDocumentHIR,
  type UtilityBindingHIR,
} from "../source-types";
import type { SourceLanguage } from "../shared-types";

export interface BuildSourceDocumentArgs {
  readonly filePath: string;
  readonly sourceFile?: ts.SourceFile;
  readonly bindings: readonly CxBinding[];
  readonly stylesBindings: ReadonlyMap<string, StyleImport>;
  readonly classUtilNames: readonly string[];
  readonly classExpressions: readonly ClassExpressionHIR[];
  readonly sourceBinder?: SourceBinderResult;
}

export function buildSourceDocument(args: BuildSourceDocumentArgs): SourceDocumentHIR {
  const styleImports = Array.from(args.stylesBindings.entries(), ([localName, resolved], index) =>
    makeStyleImportBinding(`style-import:${index}`, localName, resolved),
  );
  const utilityBindings: UtilityBindingHIR[] = [
    ...args.bindings.map((binding, index) => ({
      kind: "classnamesBind" as const,
      id: `utility-binding:cx:${index}`,
      localName: binding.cxVarName,
      stylesLocalName: binding.stylesVarName,
      scssModulePath: binding.scssModulePath,
      classNamesImportName: binding.classNamesImportName,
      bindingDeclId: resolveBindingDeclId(binding, args.sourceBinder, args.sourceFile, index),
    })),
    ...args.classUtilNames.map((localName, index) =>
      makeClassUtilBinding(`utility-binding:util:${index}`, localName),
    ),
  ];

  return makeSourceDocumentHIR({
    filePath: args.filePath,
    language: inferSourceLanguage(args.filePath),
    styleImports,
    utilityBindings,
    classExpressions: args.classExpressions,
  });
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

function inferSourceLanguage(filePath: string): SourceLanguage {
  if (filePath.endsWith(".tsx")) return "typescriptreact";
  if (filePath.endsWith(".ts") || filePath.endsWith(".mts") || filePath.endsWith(".cts")) {
    return "typescript";
  }
  if (filePath.endsWith(".jsx")) return "javascriptreact";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return "javascript";
  }
  return "unknown";
}
