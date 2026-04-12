import type { ClassRef, CxBinding, StyleImport } from "@css-module-explainer/shared";
import { buildSourceDocument } from "../../server/src/core/hir/builders/ts-source-adapter";
import {
  makeLiteralClassExpression,
  makeStyleAccessClassExpression,
  makeSymbolRefClassExpression,
  makeTemplateClassExpression,
  type ClassExpressionHIR,
  type SourceDocumentHIR,
} from "../../server/src/core/hir/source-types";

export function classExpressionFromLegacyRef(ref: ClassRef, index: number): ClassExpressionHIR {
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

export function classExpressionsFromLegacy(
  classRefs: readonly ClassRef[],
): readonly ClassExpressionHIR[] {
  return classRefs.map(classExpressionFromLegacyRef);
}

export function buildSourceDocumentFromLegacy(args: {
  readonly filePath: string;
  readonly bindings: readonly CxBinding[];
  readonly stylesBindings: ReadonlyMap<string, StyleImport>;
  readonly classUtilNames: readonly string[];
  readonly classRefs: readonly ClassRef[];
}): SourceDocumentHIR {
  return buildSourceDocument({
    filePath: args.filePath,
    bindings: args.bindings,
    stylesBindings: args.stylesBindings,
    classUtilNames: args.classUtilNames,
    classExpressions: classExpressionsFromLegacy(args.classRefs),
  });
}
