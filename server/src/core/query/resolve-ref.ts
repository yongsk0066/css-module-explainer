import type { ClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import { enumerateFiniteClassValues } from "../abstract-value/class-value-domain";
import type { EdgeCertainty } from "../semantic/certainty";
import type { FlowResolution } from "../flow/lattice";
import type { TypeResolver } from "../ts/type-resolver";
import type { AnalysisEntry } from "../indexing/document-analysis-cache";
import { projectExpressionSelectors } from "./project-expression-selectors";

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
  const styleDocument =
    ctx.styleDocument ?? env.styleDocumentForPath(ctx.expression.scssModulePath);
  if (!styleDocument) {
    return { selectors: [], dynamicExplanation: null };
  }

  const selectors = resolveExpressionAgainstStyleDocument(
    ctx.expression,
    styleDocument,
    ctx.entry.sourceFile,
    ctx.entry.sourceBinder,
    env,
  );

  return {
    selectors,
    dynamicExplanation: buildDynamicHoverExplanation(
      ctx.expression,
      selectors,
      styleDocument,
      ctx.entry.sourceFile,
      ctx.entry.sourceBinder,
      env,
    ),
  };
}

function resolveExpressionAgainstStyleDocument(
  expression: ClassExpressionHIR,
  styleDocument: StyleDocumentHIR,
  sourceFile: AnalysisEntry["sourceFile"],
  sourceBinder: AnalysisEntry["sourceBinder"],
  env: Pick<ResolveRefQueryEnv, "typeResolver" | "filePath" | "workspaceRoot">,
): readonly SelectorDeclHIR[] {
  return projectExpressionSelectors(expression, styleDocument, sourceFile, {
    ...env,
    sourceBinder,
  }).selectors;
}

function buildDynamicHoverExplanation(
  expression: ClassExpressionHIR,
  selectors: readonly SelectorDeclHIR[],
  styleDocument: StyleDocumentHIR,
  sourceFile: AnalysisEntry["sourceFile"],
  sourceBinder: AnalysisEntry["sourceBinder"],
  env: Pick<ResolveRefQueryEnv, "typeResolver" | "filePath" | "workspaceRoot">,
): DynamicHoverExplanation | null {
  switch (expression.kind) {
    case "symbolRef": {
      const projection = projectExpressionSelectors(expression, styleDocument, sourceFile, {
        ...env,
        sourceBinder,
      });
      if (!projection.abstractValue || !projection.reason) return null;
      const finiteValues = enumerateFiniteClassValues(projection.abstractValue);
      return {
        kind: "symbolRef",
        subject: expression.rawReference,
        candidates:
          finiteValues && finiteValues.length > 0
            ? finiteValues
            : selectors.map((selector) => selector.name),
        reason: projection.reason,
        ...(projection.abstractValue ? { abstractValue: projection.abstractValue } : {}),
        ...(projection.valueCertainty ? { valueCertainty: projection.valueCertainty } : {}),
        ...(projection.selectorCertainty
          ? { selectorCertainty: projection.selectorCertainty }
          : {}),
      };
    }
    case "template":
      if (selectors.length === 0) return null;
      const projection = projectExpressionSelectors(expression, styleDocument, sourceFile, {
        ...env,
        sourceBinder,
      });
      return {
        kind: "template",
        subject: expression.staticPrefix,
        candidates: selectors.map((selector) => selector.name),
        ...(projection.abstractValue ? { abstractValue: projection.abstractValue } : {}),
        ...(projection.selectorCertainty
          ? { selectorCertainty: projection.selectorCertainty }
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
