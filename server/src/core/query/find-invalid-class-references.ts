import { enumerateFiniteClassValues } from "../abstract-value/class-value-domain";
import { resolveAbstractValueSelectors } from "../abstract-value/selector-projection";
import { findClosestMatch } from "../util/text-utils";
import type { TypeResolver } from "../ts/type-resolver";
import { resolveSymbolExpressionValues } from "../semantic/resolve-symbol-values";
import type { FlowResolution } from "../flow/lattice";
import type ts from "typescript";
import type { SourceBinderResult } from "../binder/scope-types";
import type {
  ClassExpressionHIR,
  LiteralClassExpressionHIR,
  SymbolRefClassExpressionHIR,
  TemplateClassExpressionHIR,
} from "../hir/source-types";
import type { StyleDocumentHIR } from "../hir/style-types";

export interface InvalidClassReferenceQueryEnv {
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly sourceBinder?: SourceBinderResult;
  readonly resolveSymbolValues?: (
    sourceFile: ts.SourceFile,
    expression: SymbolRefClassExpressionHIR,
    env: Omit<InvalidClassReferenceQueryEnv, "resolveSymbolValues">,
  ) => FlowResolution | null;
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
      readonly abstractValue: FlowResolution["abstractValue"];
      readonly certainty: "exact" | "inferred" | "possible";
      readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
    }
  | {
      readonly kind: "missingResolvedClassDomain";
      readonly expression: SymbolRefClassExpressionHIR;
      readonly range: SymbolRefClassExpressionHIR["range"];
      readonly abstractValue: FlowResolution["abstractValue"];
      readonly certainty: "exact" | "inferred" | "possible";
      readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
    };

export function findInvalidClassReference(
  expression: ClassExpressionHIR,
  sourceFile: ts.SourceFile,
  styleDocument: StyleDocumentHIR,
  env: InvalidClassReferenceQueryEnv,
): InvalidClassReferenceFinding | null {
  if (expression.origin !== "cxCall") return null;

  switch (expression.kind) {
    case "literal": {
      if (hasSelectorNamed(styleDocument, expression.className)) return null;
      const suggestion = findClosestMatch(
        expression.className,
        styleDocument.selectors.map((selector) => selector.name),
      );
      return {
        kind: "missingStaticClass",
        expression,
        range: expression.range,
        ...(suggestion ? { suggestion } : {}),
      };
    }
    case "template": {
      if (anySelectorStartsWith(styleDocument, expression.staticPrefix)) return null;
      return {
        kind: "missingTemplatePrefix",
        expression,
        range: expression.range,
      };
    }
    case "symbolRef": {
      const symbolResolutionEnv = {
        typeResolver: env.typeResolver,
        filePath: env.filePath,
        workspaceRoot: env.workspaceRoot,
        ...(env.sourceBinder ? { sourceBinder: env.sourceBinder } : {}),
      };
      const resolved =
        env.resolveSymbolValues?.(sourceFile, expression, symbolResolutionEnv) ??
        resolveSymbolExpressionValues(sourceFile, expression, env);
      if (!resolved) return null;
      const finiteValues = enumerateFiniteClassValues(resolved.abstractValue);
      if (!finiteValues) {
        return resolveAbstractValueSelectors(resolved.abstractValue, styleDocument).length === 0
          ? {
              kind: "missingResolvedClassDomain",
              expression,
              range: expression.range,
              abstractValue: resolved.abstractValue,
              certainty: resolved.certainty,
              reason: resolved.reason,
            }
          : null;
      }
      const missingValues = finiteValues.filter((value) => !hasSelectorNamed(styleDocument, value));
      if (missingValues.length === 0) return null;
      return {
        kind: "missingResolvedClassValues",
        expression,
        range: expression.range,
        missingValues,
        abstractValue: resolved.abstractValue,
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

function anySelectorStartsWith(styleDocument: StyleDocumentHIR, prefix: string): boolean {
  for (const selector of styleDocument.selectors) {
    if (selector.name.startsWith(prefix)) return true;
  }
  return false;
}

function hasSelectorNamed(styleDocument: StyleDocumentHIR, name: string): boolean {
  return styleDocument.selectors.some((selector) => selector.name === name);
}
