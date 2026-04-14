import type { SourceBindingGraph } from "../binder/source-binding-graph";
import type { SourceBinderResult } from "../binder/scope-types";
import { prefixClassValue, type AbstractClassValue } from "../abstract-value/class-value-domain";
import { projectAbstractValueSelectors } from "../abstract-value/selector-projection";
import type { EdgeCertainty } from "../semantic/certainty";
import { resolveSymbolExpressionValues } from "../semantic/resolve-symbol-values";
import type { ClassExpressionHIR, SymbolRefClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import type { TypeResolver } from "../ts/type-resolver";
import type ts from "typescript";

export interface ProjectExpressionSelectorsEnv {
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly sourceBinder?: SourceBinderResult;
  readonly sourceBindingGraph?: SourceBindingGraph;
  readonly resolveSymbolValues?: (
    sourceFile: ts.SourceFile,
    expression: SymbolRefClassExpressionHIR,
    env: Omit<ProjectExpressionSelectorsEnv, "resolveSymbolValues">,
  ) => {
    readonly abstractValue: AbstractClassValue;
    readonly valueCertainty: EdgeCertainty;
    readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
  } | null;
}

export interface ProjectedExpressionSelectors {
  readonly selectors: readonly SelectorDeclHIR[];
  readonly abstractValue?: AbstractClassValue;
  readonly valueCertainty?: EdgeCertainty;
  readonly selectorCertainty: EdgeCertainty;
  readonly reason?: "flowLiteral" | "flowBranch" | "typeUnion";
}

export function projectExpressionSelectors(
  expression: ClassExpressionHIR,
  styleDocument: StyleDocumentHIR,
  sourceFile: ts.SourceFile,
  env: ProjectExpressionSelectorsEnv,
): ProjectedExpressionSelectors {
  const baseEnv = {
    typeResolver: env.typeResolver,
    filePath: env.filePath,
    workspaceRoot: env.workspaceRoot,
    ...(env.sourceBinder ? { sourceBinder: env.sourceBinder } : {}),
  } satisfies Omit<ProjectExpressionSelectorsEnv, "resolveSymbolValues">;
  switch (expression.kind) {
    case "literal":
    case "styleAccess": {
      const selector = findCanonicalSelector(styleDocument, expression.className);
      return {
        selectors: selector ? [selector] : [],
        selectorCertainty: "exact",
      };
    }
    case "template": {
      const abstractValue = prefixClassValue(expression.staticPrefix);
      const projection = projectAbstractValueSelectors(abstractValue, styleDocument);
      return {
        selectors: projection.selectors,
        abstractValue,
        selectorCertainty: projection.certainty,
      };
    }
    case "symbolRef":
      return projectSymbolRefSelectors(
        expression,
        styleDocument,
        sourceFile,
        env.resolveSymbolValues,
        baseEnv,
      );
    default:
      expression satisfies never;
      return {
        selectors: [],
        selectorCertainty: "possible",
      };
  }
}

function projectSymbolRefSelectors(
  expression: SymbolRefClassExpressionHIR,
  styleDocument: StyleDocumentHIR,
  sourceFile: ts.SourceFile,
  resolveSymbolValues: ProjectExpressionSelectorsEnv["resolveSymbolValues"] | undefined,
  env: Omit<ProjectExpressionSelectorsEnv, "resolveSymbolValues">,
): ProjectedExpressionSelectors {
  const resolved =
    resolveSymbolValues?.(sourceFile, expression, env) ??
    resolveSymbolExpressionValues(sourceFile, expression, env);
  if (!resolved) {
    return {
      selectors: [],
      selectorCertainty: "possible",
    };
  }
  const projection = projectAbstractValueSelectors(resolved.abstractValue, styleDocument);
  return {
    selectors: projection.selectors,
    abstractValue: resolved.abstractValue,
    valueCertainty: resolved.valueCertainty,
    selectorCertainty: projection.certainty,
    reason: resolved.reason,
  };
}

function findCanonicalSelector(
  styleDocument: StyleDocumentHIR,
  viewName: string,
): SelectorDeclHIR | null {
  const match = styleDocument.selectors.find((selector) => selector.name === viewName);
  if (!match) return null;
  return (
    styleDocument.selectors.find(
      (selector) =>
        selector.canonicalName === match.canonicalName && selector.viewKind === "canonical",
    ) ?? match
  );
}
