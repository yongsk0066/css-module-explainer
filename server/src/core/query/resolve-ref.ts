import type { ClassExpressionHIR, SymbolRefClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import { prefixClassValue } from "../abstract-value/class-value-domain";
import {
  projectAbstractValueSelectors,
  resolveAbstractValueSelectors,
} from "../abstract-value/selector-projection";
import { buildSourceSemanticGraph } from "../semantic/graph-builder";
import type { EdgeCertainty } from "../semantic/certainty";
import { buildSemanticReferenceIndex } from "../semantic/reference-index";
import { resolveSymbolExpressionValues } from "../semantic/resolve-symbol-values";
import type { FlowResolution } from "../flow/lattice";
import type { TypeResolver } from "../ts/type-resolver";
import type { AnalysisEntry } from "../indexing/document-analysis-cache";

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
  readonly certainty?: EdgeCertainty;
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

  const graph = buildSourceSemanticGraph({
    sourceDocument: ctx.entry.sourceDocument,
    styleDocumentsByPath: new Map([[ctx.expression.scssModulePath, styleDocument]]),
    resolveSymbolValues(ref) {
      return resolveSymbolExpressionValues(ctx.entry.sourceFile, ref, {
        ...env,
        sourceBinder: ctx.entry.sourceBinder,
      });
    },
  });
  const targets = buildSemanticReferenceIndex(graph).findTargetsForRef(ctx.expression.id);
  const fallbackSelectors =
    targets.length === 0
      ? resolveExpressionAgainstStyleDocument(
          ctx.expression,
          styleDocument,
          ctx.entry.sourceFile,
          ctx.entry.sourceBinder,
          env,
        )
      : null;

  if (targets.length === 0 && fallbackSelectors) {
    return {
      selectors: fallbackSelectors,
      dynamicExplanation: buildDynamicHoverExplanation(
        ctx.expression,
        fallbackSelectors,
        styleDocument,
        ctx.entry.sourceFile,
        ctx.entry.sourceBinder,
        env,
      ),
    };
  }

  const resolvedSelectors: SelectorDeclHIR[] = [];
  const emitted = new Set<string>();
  for (const target of targets) {
    const key = `${target.selectorFilePath}::${target.canonicalName}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const selector = styleDocument.selectors.find(
      (candidate) =>
        candidate.canonicalName === target.canonicalName && candidate.viewKind === "canonical",
    );
    if (selector) resolvedSelectors.push(selector);
  }

  const selectors =
    resolvedSelectors.length > 0
      ? resolvedSelectors
      : resolveExpressionAgainstStyleDocument(
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
  switch (expression.kind) {
    case "literal":
    case "styleAccess": {
      const selector = findCanonicalSelector(styleDocument, expression.className);
      return selector ? [selector] : [];
    }
    case "template":
      return resolveAbstractValueSelectors(
        prefixClassValue(expression.staticPrefix),
        styleDocument,
      );
    case "symbolRef": {
      const resolved = resolveExpressionSymbolValues(sourceFile, sourceBinder, expression, env);
      if (!resolved) return [];
      return resolveAbstractValueSelectors(resolved.abstractValue, styleDocument);
    }
    default:
      expression satisfies never;
      return [];
  }
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
      const resolved = resolveExpressionSymbolValues(sourceFile, sourceBinder, expression, env);
      if (!resolved) return null;
      const projection = projectAbstractValueSelectors(resolved.abstractValue, styleDocument);
      return {
        kind: "symbolRef",
        subject: expression.rawReference,
        candidates:
          resolved.values.length > 0 ? resolved.values : selectors.map((selector) => selector.name),
        abstractValue: resolved.abstractValue,
        certainty: projection.certainty,
        reason: resolved.reason,
      };
    }
    case "template":
      if (selectors.length === 0) return null;
      return {
        kind: "template",
        subject: expression.staticPrefix,
        candidates: selectors.map((selector) => selector.name),
        abstractValue: prefixClassValue(expression.staticPrefix),
        certainty: projectAbstractValueSelectors(
          prefixClassValue(expression.staticPrefix),
          styleDocument,
        ).certainty,
      };
    case "literal":
    case "styleAccess":
      return null;
    default:
      expression satisfies never;
      return null;
  }
}

function resolveExpressionSymbolValues(
  sourceFile: AnalysisEntry["sourceFile"],
  sourceBinder: AnalysisEntry["sourceBinder"],
  expression: SymbolRefClassExpressionHIR,
  env: Pick<ResolveRefQueryEnv, "typeResolver" | "filePath" | "workspaceRoot">,
) {
  return resolveSymbolExpressionValues(sourceFile, expression, {
    ...env,
    sourceBinder,
  });
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
