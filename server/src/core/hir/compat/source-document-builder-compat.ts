import type { ClassRef } from "@css-module-explainer/shared";
import {
  makeLiteralClassExpression,
  makeStyleAccessClassExpression,
  makeSymbolRefClassExpression,
  makeTemplateClassExpression,
  type ClassExpressionHIR,
  type SourceDocumentHIR,
} from "../source-types";
import { buildSourceDocument, type BuildSourceDocumentArgs } from "../builders/ts-source-adapter";

export interface BuildSourceDocumentFromLegacyArgs extends Omit<
  BuildSourceDocumentArgs,
  "classExpressions"
> {
  readonly classRefs: readonly ClassRef[];
}

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
