import type { ClassExpressionHIR, SymbolRefClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import { buildSourceSemanticGraph } from "../semantic/graph-builder";
import { buildSemanticReferenceIndex } from "../semantic/reference-index";
import { resolveSymbolExpressionValues } from "../semantic/resolve-symbol-values";
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

export function resolveRefSelectors(
  ctx: ResolveRefQueryContext,
  env: ResolveRefQueryEnv,
): readonly SelectorDeclHIR[] {
  const styleDocument =
    ctx.styleDocument ?? env.styleDocumentForPath(ctx.expression.scssModulePath);
  if (!styleDocument) return [];

  const graph = buildSourceSemanticGraph({
    sourceDocument: ctx.entry.sourceDocument,
    styleDocumentsByPath: new Map([[ctx.expression.scssModulePath, styleDocument]]),
    resolveSymbolValues(ref) {
      return resolveSymbolExpressionValues(ctx.entry.sourceFile, ref, env);
    },
  });
  const targets = buildSemanticReferenceIndex(graph).findTargetsForRef(ctx.expression.id);
  if (targets.length === 0) {
    return resolveExpressionAgainstStyleDocument(
      ctx.expression,
      styleDocument,
      ctx.entry.sourceFile,
      env,
    );
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

  return resolvedSelectors.length > 0
    ? resolvedSelectors
    : resolveExpressionAgainstStyleDocument(
        ctx.expression,
        styleDocument,
        ctx.entry.sourceFile,
        env,
      );
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
