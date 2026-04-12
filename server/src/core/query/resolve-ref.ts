import type { ClassRef, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { resolveClassRefContext } from "../cx/call-resolver";
import { selectorDeclToLegacySelectorInfo } from "../hir/compat/style-document-compat";
import type { SourceDocumentHIR } from "../hir/source-types";
import type { StyleDocumentHIR } from "../hir/style-types";
import { buildSourceSemanticGraph } from "../semantic/graph-builder";
import { buildSemanticReferenceIndex } from "../semantic/reference-index";
import type { TypeResolver } from "../ts/type-resolver";
import type { AnalysisEntry } from "../indexing/document-analysis-cache";

export interface ResolveRefQueryEnv {
  readonly styleDocumentForPath: (path: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

export interface ResolveRefQueryContext {
  readonly ref: ClassRef;
  readonly classMap: ScssClassMap;
  readonly entry: AnalysisEntry;
}

export function resolveRefSelectorInfos(
  ctx: ResolveRefQueryContext,
  env: ResolveRefQueryEnv,
): readonly SelectorInfo[] {
  const sourceExpression = findMatchingExpressionId(ctx.entry.sourceDocument, ctx.ref);
  if (!sourceExpression) {
    return resolveClassRefContext(ctx, env);
  }

  const styleDocumentsByPath = collectStyleDocuments(ctx.entry.sourceDocument, ctx.ref, env);
  if (styleDocumentsByPath.size === 0) {
    return resolveClassRefContext(ctx, env);
  }

  const graph = buildSourceSemanticGraph({
    sourceDocument: ctx.entry.sourceDocument,
    styleDocumentsByPath,
    resolveSymbolValues(ref) {
      const resolved = env.typeResolver.resolve(env.filePath, ref.rawReference, env.workspaceRoot);
      return resolved.kind === "union" ? resolved.values : [];
    },
  });
  const targets = buildSemanticReferenceIndex(graph).findTargetsForRef(sourceExpression.id);
  if (targets.length === 0) {
    return resolveClassRefContext(ctx, env);
  }

  const resolvedInfos: SelectorInfo[] = [];
  const emitted = new Set<string>();
  for (const target of targets) {
    const key = `${target.selectorFilePath}::${target.canonicalName}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const styleDocument = styleDocumentsByPath.get(target.selectorFilePath);
    const selector = styleDocument?.selectors.find(
      (candidate) =>
        candidate.canonicalName === target.canonicalName && candidate.viewKind === "canonical",
    );
    if (selector) {
      resolvedInfos.push(selectorDeclToLegacySelectorInfo(selector));
    }
  }

  return resolvedInfos.length > 0 ? resolvedInfos : resolveClassRefContext(ctx, env);
}

function collectStyleDocuments(
  sourceDocument: SourceDocumentHIR,
  ref: ClassRef,
  env: Pick<ResolveRefQueryEnv, "styleDocumentForPath">,
): ReadonlyMap<string, StyleDocumentHIR> {
  const byPath = new Map<string, StyleDocumentHIR>();

  for (const styleImport of sourceDocument.styleImports) {
    if (styleImport.resolved.kind !== "resolved") continue;
    const styleDocument = env.styleDocumentForPath(styleImport.resolved.absolutePath);
    if (styleDocument) {
      byPath.set(styleImport.resolved.absolutePath, styleDocument);
    }
  }

  if (!byPath.has(ref.scssModulePath)) {
    const styleDocument = env.styleDocumentForPath(ref.scssModulePath);
    if (styleDocument) {
      byPath.set(ref.scssModulePath, styleDocument);
    }
  }

  return byPath;
}

function findMatchingExpressionId(
  sourceDocument: SourceDocumentHIR,
  ref: ClassRef,
): SourceDocumentHIR["classExpressions"][number] | null {
  return (
    sourceDocument.classExpressions.find((expr) => {
      if (expr.scssModulePath !== ref.scssModulePath) return false;
      if (!sameRange(expr.range, ref.originRange)) return false;

      switch (expr.kind) {
        case "literal":
          return ref.kind === "static" && expr.className === ref.className;
        case "template":
          return ref.kind === "template" && expr.rawTemplate === ref.rawTemplate;
        case "symbolRef":
          return ref.kind === "variable" && expr.rawReference === ref.variableName;
        case "styleAccess":
          return (
            ref.kind === "static" &&
            expr.className === ref.className &&
            ref.origin === "styleAccess"
          );
        default:
          expr satisfies never;
          return false;
      }
    }) ?? null
  );
}

function sameRange(
  left: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  },
  right: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  },
): boolean {
  return (
    left.start.line === right.start.line &&
    left.start.character === right.start.character &&
    left.end.line === right.end.line &&
    left.end.character === right.end.character
  );
}
