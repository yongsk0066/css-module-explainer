import type { ScssClassMap } from "@css-module-explainer/shared";
import { findClosestMatch } from "../util/text-utils";
import type { TypeResolver } from "../ts/type-resolver";
import { resolveSymbolExpressionValues } from "../semantic/resolve-symbol-values";
import type ts from "typescript";
import type {
  ClassExpressionHIR,
  LiteralClassExpressionHIR,
  SymbolRefClassExpressionHIR,
  TemplateClassExpressionHIR,
} from "../hir/source-types";

export interface InvalidClassReferenceQueryEnv {
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

export type InvalidClassReferenceFinding =
  | {
      readonly kind: "missingStaticClass";
      readonly expression: LiteralClassExpressionHIR;
      readonly range: LiteralClassExpressionHIR["range"];
      readonly suggestion?: string;
    }
  | {
      readonly kind: "missingTemplatePrefix";
      readonly expression: TemplateClassExpressionHIR;
      readonly range: TemplateClassExpressionHIR["range"];
    }
  | {
      readonly kind: "missingResolvedClassValues";
      readonly expression: SymbolRefClassExpressionHIR;
      readonly range: SymbolRefClassExpressionHIR["range"];
      readonly missingValues: readonly string[];
      readonly certainty: "exact" | "inferred" | "possible";
      readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
    };

export function findInvalidClassReference(
  expression: ClassExpressionHIR,
  sourceFile: ts.SourceFile,
  classMap: ScssClassMap,
  env: InvalidClassReferenceQueryEnv,
): InvalidClassReferenceFinding | null {
  if (expression.origin !== "cxCall") return null;

  switch (expression.kind) {
    case "literal": {
      if (classMap.has(expression.className)) return null;
      const suggestion = findClosestMatch(expression.className, classMap.keys());
      return {
        kind: "missingStaticClass",
        expression,
        range: expression.range,
        ...(suggestion ? { suggestion } : {}),
      };
    }
    case "template": {
      if (anyValueStartsWith(classMap, expression.staticPrefix)) return null;
      return {
        kind: "missingTemplatePrefix",
        expression,
        range: expression.range,
      };
    }
    case "symbolRef": {
      const resolved = resolveSymbolExpressionValues(sourceFile, expression, env);
      if (!resolved) return null;
      const missingValues = resolved.values.filter((value) => !classMap.has(value));
      if (missingValues.length === 0) return null;
      return {
        kind: "missingResolvedClassValues",
        expression,
        range: expression.range,
        missingValues,
        certainty: resolved.certainty,
        reason: resolved.reason,
      };
    }
    case "styleAccess":
      return null;
    default:
      expression satisfies never;
      return null;
  }
}

function anyValueStartsWith(classMap: ScssClassMap, prefix: string): boolean {
  for (const name of classMap.keys()) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}
