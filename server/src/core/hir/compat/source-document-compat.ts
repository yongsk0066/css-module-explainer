import type { ClassRef } from "@css-module-explainer/shared";
import type {
  ClassExpressionHIR,
  SourceDocumentHIR,
  StyleAccessClassExpressionHIR,
  SymbolRefClassExpressionHIR,
} from "../source-types";

export function classExpressionToLegacyClassRef(expr: ClassExpressionHIR): ClassRef {
  switch (expr.kind) {
    case "literal":
      return {
        kind: "static",
        origin: expr.origin,
        className: expr.className,
        scssModulePath: expr.scssModulePath,
        originRange: expr.range,
      };
    case "template":
      return {
        kind: "template",
        origin: expr.origin,
        rawTemplate: expr.rawTemplate,
        staticPrefix: expr.staticPrefix,
        scssModulePath: expr.scssModulePath,
        originRange: expr.range,
      };
    case "symbolRef":
      return symbolRefToLegacyClassRef(expr);
    case "styleAccess":
      return styleAccessToLegacyClassRef(expr);
    default:
      expr satisfies never;
      return expr;
  }
}

export function sourceDocumentToLegacyClassRefs(doc: SourceDocumentHIR): readonly ClassRef[] {
  return doc.classExpressions.map(classExpressionToLegacyClassRef);
}

function symbolRefToLegacyClassRef(expr: SymbolRefClassExpressionHIR): ClassRef {
  const variableName =
    expr.pathSegments.length === 0
      ? expr.rootName
      : [expr.rootName, ...expr.pathSegments].join(".");

  return {
    kind: "variable",
    origin: expr.origin,
    variableName,
    scssModulePath: expr.scssModulePath,
    originRange: expr.range,
  };
}

function styleAccessToLegacyClassRef(expr: StyleAccessClassExpressionHIR): ClassRef {
  return {
    kind: "static",
    origin: "styleAccess",
    className: expr.className,
    scssModulePath: expr.scssModulePath,
    originRange: expr.range,
  };
}
