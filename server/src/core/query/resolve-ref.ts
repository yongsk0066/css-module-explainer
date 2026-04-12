import type { ClassExpressionHIR, SymbolRefClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import { buildSourceSemanticGraph } from "../semantic/graph-builder";
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
  readonly certainty?: FlowResolution["certainty"];
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
      return resolveSymbolExpressionValues(ctx.entry.sourceFile, ref, env);
    },
  });
  const targets = buildSemanticReferenceIndex(graph).findTargetsForRef(ctx.expression.id);
  const fallbackSelectors =
    targets.length === 0
      ? resolveExpressionAgainstStyleDocument(
          ctx.expression,
          styleDocument,
          ctx.entry.sourceFile,
          env,
        )
      : null;

  if (targets.length === 0 && fallbackSelectors) {
    return {
      selectors: fallbackSelectors,
      dynamicExplanation: buildDynamicHoverExplanation(
        ctx.expression,
        fallbackSelectors,
        ctx.entry.sourceFile,
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
          env,
        );

  return {
    selectors,
    dynamicExplanation: buildDynamicHoverExplanation(
      ctx.expression,
      selectors,
      ctx.entry.sourceFile,
      env,
    ),
  };
}

function resolveExpressionAgainstStyleDocument(
  expression: ClassExpressionHIR,
  styleDocument: StyleDocumentHIR,
  sourceFile: AnalysisEntry["sourceFile"],
  env: Pick<ResolveRefQueryEnv, "typeResolver" | "filePath" | "workspaceRoot">,
): readonly SelectorDeclHIR[] {
  switch (expression.kind) {
    case "literal":
    case "styleAccess": {
      const selector = findCanonicalSelector(styleDocument, expression.className);
      return selector ? [selector] : [];
    }
    case "template":
      return resolveTemplateSelectors(expression.staticPrefix, styleDocument);
    case "symbolRef": {
      const resolved = resolveExpressionSymbolValues(sourceFile, expression, env);
      if (!resolved) return [];
      return resolved.values.flatMap((value) => {
        const selector = findCanonicalSelector(styleDocument, value);
        return selector ? [selector] : [];
      });
    }
    default:
      expression satisfies never;
      return [];
  }
}

function buildDynamicHoverExplanation(
  expression: ClassExpressionHIR,
  selectors: readonly SelectorDeclHIR[],
  sourceFile: AnalysisEntry["sourceFile"],
  env: Pick<ResolveRefQueryEnv, "typeResolver" | "filePath" | "workspaceRoot">,
): DynamicHoverExplanation | null {
  switch (expression.kind) {
    case "symbolRef": {
      const resolved = resolveExpressionSymbolValues(sourceFile, expression, env);
      if (!resolved) return null;
      return {
        kind: "symbolRef",
        subject: expression.rawReference,
        candidates: resolved.values,
        certainty: resolved.certainty,
        reason: resolved.reason,
      };
    }
    case "template":
      return selectors.length > 0
        ? {
            kind: "template",
            subject: expression.staticPrefix,
            candidates: selectors.map((selector) => selector.name),
          }
        : null;
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
  expression: SymbolRefClassExpressionHIR,
  env: Pick<ResolveRefQueryEnv, "typeResolver" | "filePath" | "workspaceRoot">,
) {
  return resolveSymbolExpressionValues(sourceFile, expression, env);
}

function resolveTemplateSelectors(
  staticPrefix: string,
  styleDocument: StyleDocumentHIR,
): readonly SelectorDeclHIR[] {
  const emitted = new Set<string>();
  const resolved: SelectorDeclHIR[] = [];

  for (const selector of styleDocument.selectors) {
    if (!selector.name.startsWith(staticPrefix)) continue;
    const canonical = findCanonicalSelector(styleDocument, selector.name);
    if (!canonical || emitted.has(canonical.canonicalName)) continue;
    emitted.add(canonical.canonicalName);
    resolved.push(canonical);
  }

  return resolved;
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
