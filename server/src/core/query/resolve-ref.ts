import type { ClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import type { EdgeCertainty } from "../semantic/certainty";
import type { FlowResolution } from "../flow/lattice";
import type { TypeResolver } from "../ts/type-resolver";
import type { AnalysisEntry } from "../indexing/document-analysis-cache";
import { readSourceExpressionResolution } from "./read-source-expression-resolution";

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
  const resolution = readSourceExpressionResolution(
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
  if (!resolution.styleDocument) {
    return { selectors: [], dynamicExplanation: null };
  }

  return {
    selectors: resolution.selectors,
    dynamicExplanation: buildDynamicHoverExplanation(ctx.expression, resolution),
  };
}

function buildDynamicHoverExplanation(
  expression: ClassExpressionHIR,
  resolution: Pick<
    ReturnType<typeof readSourceExpressionResolution>,
    | "selectors"
    | "finiteValues"
    | "abstractValue"
    | "valueCertainty"
    | "selectorCertainty"
    | "reason"
  >,
): DynamicHoverExplanation | null {
  switch (expression.kind) {
    case "symbolRef": {
      if (!resolution.abstractValue || !resolution.reason) return null;
      return {
        kind: "symbolRef",
        subject: expression.rawReference,
        candidates:
          resolution.finiteValues && resolution.finiteValues.length > 0
            ? resolution.finiteValues
            : resolution.selectors.map((selector) => selector.name),
        reason: resolution.reason,
        abstractValue: resolution.abstractValue,
        ...(resolution.valueCertainty ? { valueCertainty: resolution.valueCertainty } : {}),
        ...(resolution.selectorCertainty
          ? { selectorCertainty: resolution.selectorCertainty }
          : {}),
      };
    }
    case "template":
      if (resolution.selectors.length === 0) return null;
      return {
        kind: "template",
        subject: expression.staticPrefix,
        candidates: resolution.selectors.map((selector) => selector.name),
        ...(resolution.abstractValue ? { abstractValue: resolution.abstractValue } : {}),
        ...(resolution.selectorCertainty
          ? { selectorCertainty: resolution.selectorCertainty }
          : {}),
      };
    case "literal":
    case "styleAccess":
      return null;
    default:
      expression satisfies never;
      return null;
  }
}
