import type { ClassRef, CxBinding, StyleImport } from "@css-module-explainer/shared";
import {
  makeClassUtilBinding,
  makeLiteralClassExpression,
  makeSourceDocumentHIR,
  makeStyleAccessClassExpression,
  makeStyleImportBinding,
  makeSymbolRefClassExpression,
  makeTemplateClassExpression,
  type ClassExpressionHIR,
  type SourceDocumentHIR,
  type UtilityBindingHIR,
} from "../source-types";
import type { SourceLanguage } from "../shared-types";

export interface BuildSourceDocumentFromLegacyArgs {
  readonly filePath: string;
  readonly bindings: readonly CxBinding[];
  readonly stylesBindings: ReadonlyMap<string, StyleImport>;
  readonly classUtilNames: readonly string[];
  readonly classRefs: readonly ClassRef[];
}

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
      scope: binding.scope,
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

/**
 * Builds source HIR from legacy class-ref output so compatibility
 * fixtures and migration tests can still reconstruct the document.
 */
export function buildSourceDocumentFromLegacy(
  args: BuildSourceDocumentFromLegacyArgs,
): SourceDocumentHIR {
  return buildSourceDocument({
    filePath: args.filePath,
    bindings: args.bindings,
    stylesBindings: args.stylesBindings,
    classUtilNames: args.classUtilNames,
    classExpressions: args.classRefs.map(toClassExpression),
  });
}

function toClassExpression(ref: ClassRef, index: number): ClassExpressionHIR {
  const id = `class-expr:${index}`;
  switch (ref.kind) {
    case "static":
      return ref.origin === "styleAccess"
        ? makeStyleAccessClassExpression(
            id,
            ref.scssModulePath,
            ref.className,
            [ref.className],
            ref.originRange,
          )
        : makeLiteralClassExpression(
            id,
            ref.origin,
            ref.scssModulePath,
            ref.className,
            ref.originRange,
          );
    case "template":
      return makeTemplateClassExpression(
        id,
        ref.origin,
        ref.scssModulePath,
        ref.rawTemplate,
        ref.staticPrefix,
        ref.originRange,
      );
    case "variable": {
      const [rootName = ref.variableName, ...pathSegments] = ref.variableName.split(".");
      return makeSymbolRefClassExpression(
        id,
        ref.origin,
        ref.scssModulePath,
        ref.variableName,
        rootName,
        pathSegments,
        ref.originRange,
      );
    }
    default:
      ref satisfies never;
      return ref;
  }
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
