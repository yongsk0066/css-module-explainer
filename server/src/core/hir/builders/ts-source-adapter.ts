import type { CxBinding, StyleImport } from "@css-module-explainer/shared";
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
  readonly bindings: readonly CxBinding[];
  readonly stylesBindings: ReadonlyMap<string, StyleImport>;
  readonly classUtilNames: readonly string[];
  readonly classExpressions: readonly ClassExpressionHIR[];
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
      bindingRange: binding.bindingRange,
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
