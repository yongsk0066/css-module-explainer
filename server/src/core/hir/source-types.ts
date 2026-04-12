import type { ClassRefOrigin, Range, StyleImport } from "@css-module-explainer/shared";
import type { HirDocumentBase, HirNodeBase, SourceLanguage } from "./shared-types";

export interface SourceDocumentHIR extends HirDocumentBase {
  readonly kind: "source";
  readonly language: SourceLanguage;
  readonly styleImports: readonly StyleImportBindingHIR[];
  readonly utilityBindings: readonly UtilityBindingHIR[];
  readonly classExpressions: readonly ClassExpressionHIR[];
}

export interface StyleImportBindingHIR extends HirNodeBase {
  readonly kind: "styleImport";
  readonly localName: string;
  readonly resolved: StyleImport;
}

export interface ClassnamesBindUtilityBindingHIR extends HirNodeBase {
  readonly kind: "classnamesBind";
  readonly localName: string;
  readonly stylesLocalName: string;
  readonly scssModulePath: string;
  readonly classNamesImportName: string;
  readonly scope: {
    readonly startLine: number;
    readonly endLine: number;
  };
}

export interface ClassUtilBindingHIR extends HirNodeBase {
  readonly kind: "classUtil";
  readonly localName: string;
}

export type UtilityBindingHIR = ClassnamesBindUtilityBindingHIR | ClassUtilBindingHIR;

interface ClassExpressionBase extends HirNodeBase {
  readonly origin: ClassRefOrigin;
  readonly scssModulePath: string;
  readonly range: Range;
}

export interface LiteralClassExpressionHIR extends ClassExpressionBase {
  readonly kind: "literal";
  readonly className: string;
}

export interface TemplateClassExpressionHIR extends ClassExpressionBase {
  readonly kind: "template";
  readonly rawTemplate: string;
  readonly staticPrefix: string;
}

export interface SymbolRefClassExpressionHIR extends ClassExpressionBase {
  readonly kind: "symbolRef";
  readonly rawReference: string;
  readonly rootName: string;
  readonly pathSegments: readonly string[];
}

/**
 * Compatibility-backed source HIR for direct `styles.x` access.
 *
 * This node currently preserves the resolved class token and target
 * module path. It can grow into a richer property/element-access
 * shape once more resolution logic moves away from the legacy
 * `ClassRef` model.
 */
export interface StyleAccessClassExpressionHIR extends ClassExpressionBase {
  readonly kind: "styleAccess";
  readonly className: string;
  readonly accessPath: readonly string[];
}

export type ClassExpressionHIR =
  | LiteralClassExpressionHIR
  | TemplateClassExpressionHIR
  | SymbolRefClassExpressionHIR
  | StyleAccessClassExpressionHIR;

export interface BuildSourceDocumentHIRArgs {
  readonly filePath: string;
  readonly language: SourceLanguage;
  readonly styleImports: readonly StyleImportBindingHIR[];
  readonly utilityBindings: readonly UtilityBindingHIR[];
  readonly classExpressions: readonly ClassExpressionHIR[];
}

export function makeStyleImportBinding(
  id: string,
  localName: string,
  resolved: StyleImport,
): StyleImportBindingHIR {
  return resolved.kind === "missing"
    ? { kind: "styleImport", id, localName, resolved, range: resolved.range }
    : { kind: "styleImport", id, localName, resolved };
}

export function makeClassUtilBinding(id: string, localName: string): ClassUtilBindingHIR {
  return { kind: "classUtil", id, localName };
}

export function makeSourceDocumentHIR(args: BuildSourceDocumentHIRArgs): SourceDocumentHIR {
  return {
    kind: "source",
    filePath: args.filePath,
    language: args.language,
    styleImports: args.styleImports,
    utilityBindings: args.utilityBindings,
    classExpressions: args.classExpressions,
  };
}

export function makeLiteralClassExpression(
  id: string,
  origin: ClassRefOrigin,
  scssModulePath: string,
  className: string,
  range: Range,
): LiteralClassExpressionHIR {
  return { kind: "literal", id, origin, scssModulePath, className, range };
}

export function makeTemplateClassExpression(
  id: string,
  origin: ClassRefOrigin,
  scssModulePath: string,
  rawTemplate: string,
  staticPrefix: string,
  range: Range,
): TemplateClassExpressionHIR {
  return { kind: "template", id, origin, scssModulePath, rawTemplate, staticPrefix, range };
}

export function makeSymbolRefClassExpression(
  id: string,
  origin: ClassRefOrigin,
  scssModulePath: string,
  rawReference: string,
  rootName: string,
  pathSegments: readonly string[],
  range: Range,
): SymbolRefClassExpressionHIR {
  return {
    kind: "symbolRef",
    id,
    origin,
    scssModulePath,
    rawReference,
    rootName,
    pathSegments,
    range,
  };
}

export function makeStyleAccessClassExpression(
  id: string,
  scssModulePath: string,
  className: string,
  accessPath: readonly string[],
  range: Range,
): StyleAccessClassExpressionHIR {
  return {
    kind: "styleAccess",
    id,
    origin: "styleAccess",
    scssModulePath,
    className,
    accessPath,
    range,
  };
}
