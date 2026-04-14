import type { ClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import type { EdgeCertainty } from "../semantic/certainty";
import type { FlowResolution } from "../flow/lattice";
import type { TypeResolver } from "../ts/type-resolver";
import type { AnalysisEntry } from "../indexing/document-analysis-cache";
import { readExpressionSemantics } from "./read-expression-semantics";

export interface ResolveRefQueryEnv {
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

export interface ResolveRefQueryContext {
  readonly expression: ClassExpressionHIR;
  readonly styleDocument: StyleDocumentHIR | null;
  readonly entry: AnalysisEntry;
}

export interface DynamicHoverExplanation {
  readonly kind: "symbolRef" | "template";
  readonly subject: string;
  readonly candidates: readonly string[];
  readonly abstractValue?: FlowResolution["abstractValue"];
  readonly valueCertainty?: EdgeCertainty;
  readonly selectorCertainty?: EdgeCertainty;
  readonly reason?: FlowResolution["reason"];
}

export interface ResolveRefDetails {
  readonly selectors: readonly SelectorDeclHIR[];
  readonly dynamicExplanation: DynamicHoverExplanation | null;
}

export function resolveRefSelectors(
  ctx: ResolveRefQueryContext,
  env: ResolveRefQueryEnv,
): readonly SelectorDeclHIR[] {
  return resolveRefDetails(ctx, env).selectors;
}

export function resolveRefDetails(
  ctx: ResolveRefQueryContext,
  env: ResolveRefQueryEnv,
): ResolveRefDetails {
  const semantics = readExpressionSemantics(
    {
      expression: ctx.expression,
      sourceFile: ctx.entry.sourceFile,
      styleDocument: ctx.styleDocument,
    },
    {
      styleDocumentForPath: env.styleDocumentForPath,
      typeResolver: env.typeResolver,
      filePath: env.filePath,
      workspaceRoot: env.workspaceRoot,
      sourceBinder: ctx.entry.sourceBinder,
      sourceBindingGraph: ctx.entry.sourceBindingGraph,
    },
  );
  if (!semantics.styleDocument) {
    return { selectors: [], dynamicExplanation: null };
  }

  return {
    selectors: semantics.selectors,
    dynamicExplanation: buildDynamicHoverExplanation(ctx.expression, semantics),
  };
}

function buildDynamicHoverExplanation(
  expression: ClassExpressionHIR,
  semantics: ReturnType<typeof readExpressionSemantics>,
): DynamicHoverExplanation | null {
  switch (expression.kind) {
    case "symbolRef": {
      if (!semantics.abstractValue || !semantics.reason) return null;
      return {
        kind: "symbolRef",
        subject: expression.rawReference,
        candidates: semantics.candidateNames,
        reason: semantics.reason,
        abstractValue: semantics.abstractValue,
        ...(semantics.valueCertainty ? { valueCertainty: semantics.valueCertainty } : {}),
        ...(semantics.selectorCertainty ? { selectorCertainty: semantics.selectorCertainty } : {}),
      };
    }
    case "template":
      if (semantics.selectors.length === 0) return null;
      return {
        kind: "template",
        subject: expression.staticPrefix,
        candidates: semantics.candidateNames,
        ...(semantics.abstractValue ? { abstractValue: semantics.abstractValue } : {}),
        ...(semantics.selectorCertainty ? { selectorCertainty: semantics.selectorCertainty } : {}),
      };
    case "literal":
    case "styleAccess":
      return null;
    default:
      expression satisfies never;
      return null;
  }
}
