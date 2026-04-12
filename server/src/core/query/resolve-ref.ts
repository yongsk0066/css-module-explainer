import type { ClassRef, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { resolveFlowClassValues } from "../flow/class-value-analysis";
import { buildStyleDocumentFromClassMap } from "../hir/builders/style-adapter";
import { selectorDeclToLegacySelectorInfo } from "../hir/compat/style-document-compat";
import type { SourceDocumentHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
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
  const styleDocument =
    env.styleDocumentForPath(ctx.ref.scssModulePath) ??
    buildStyleDocumentFromClassMap(ctx.ref.scssModulePath, ctx.classMap);
  const sourceExpression = findMatchingExpressionId(ctx.entry.sourceDocument, ctx.ref);
  if (!sourceExpression) {
    return resolveRefAgainstStyleDocument(ctx.ref, styleDocument, env);
  }

  const graph = buildSourceSemanticGraph({
    sourceDocument: ctx.entry.sourceDocument,
    styleDocumentsByPath: new Map([[ctx.ref.scssModulePath, styleDocument]]),
    resolveSymbolValues(ref) {
      const flow = resolveFlowClassValues(ctx.entry.sourceFile, ref.range, ref.rootName);
      if (flow) return flow;
      const resolved = env.typeResolver.resolve(env.filePath, ref.rawReference, env.workspaceRoot);
      return resolved.kind === "union"
        ? { values: resolved.values, certainty: "inferred", reason: "typeUnion" }
        : null;
    },
  });
  const targets = buildSemanticReferenceIndex(graph).findTargetsForRef(sourceExpression.id);
  if (targets.length === 0) {
    return resolveRefAgainstStyleDocument(ctx.ref, styleDocument, env);
  }

  const resolvedInfos: SelectorInfo[] = [];
  const emitted = new Set<string>();
  for (const target of targets) {
    const key = `${target.selectorFilePath}::${target.canonicalName}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const selector = styleDocument.selectors.find(
      (candidate) =>
        candidate.canonicalName === target.canonicalName && candidate.viewKind === "canonical",
    );
    if (selector) {
      resolvedInfos.push(selectorDeclToLegacySelectorInfo(selector));
    }
  }

  return resolvedInfos.length > 0
    ? resolvedInfos
    : resolveRefAgainstStyleDocument(ctx.ref, styleDocument, env);
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

function resolveRefAgainstStyleDocument(
  ref: ClassRef,
  styleDocument: StyleDocumentHIR,
  env: Pick<ResolveRefQueryEnv, "typeResolver" | "filePath" | "workspaceRoot">,
): readonly SelectorInfo[] {
  switch (ref.kind) {
    case "static": {
      const selector = findCanonicalSelector(styleDocument, ref.className);
      return selector ? [selectorDeclToLegacySelectorInfo(selector)] : [];
    }
    case "template":
      return resolveTemplateSelectors(ref.staticPrefix, styleDocument);
    case "variable": {
      const resolved = env.typeResolver.resolve(env.filePath, ref.variableName, env.workspaceRoot);
      if (resolved.kind !== "union") return [];
      return resolved.values.flatMap((value) => {
        const selector = findCanonicalSelector(styleDocument, value);
        return selector ? [selectorDeclToLegacySelectorInfo(selector)] : [];
      });
    }
    default:
      ref satisfies never;
      return [];
  }
}

function resolveTemplateSelectors(
  staticPrefix: string,
  styleDocument: StyleDocumentHIR,
): readonly SelectorInfo[] {
  const emitted = new Set<string>();
  const resolved: SelectorInfo[] = [];

  for (const selector of styleDocument.selectors) {
    if (!selector.name.startsWith(staticPrefix)) continue;
    const canonical = findCanonicalSelector(styleDocument, selector.name);
    if (!canonical || emitted.has(canonical.canonicalName)) continue;
    emitted.add(canonical.canonicalName);
    resolved.push(selectorDeclToLegacySelectorInfo(canonical));
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
