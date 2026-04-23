import {
  planSelectorRename,
  readExpressionRenameTarget,
  type SelectorRenameReadResult,
  type SelectorRenameTarget,
} from "../../engine-core-ts/src/core/rewrite/selector-rename";
import {
  readSelectorRewriteSafetySummary,
  type SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import type {
  LiteralClassExpressionHIR,
  StyleAccessClassExpressionHIR,
} from "../../engine-core-ts/src/core/hir/source-types";
import type {
  SelectorDeclHIR,
  StyleDocumentHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import { readStyleSelectorRewritePolicy } from "../../engine-core-ts/src/core/rewrite/read-style-rewrite-policy";
import { pathToFileUrl } from "../../engine-core-ts/src/core/util/text-utils";
import type { CursorParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveRustSourceResolutionSelectorMatch,
  resolveSelectedQueryBackendKind,
  usesRustSourceResolutionBackend,
} from "./source-resolution-query-backend";

export interface SourceRenameQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSourceResolutionSelectorMatch?: typeof resolveRustSourceResolutionSelectorMatch;
}

type RenameableSourceExpression = LiteralClassExpressionHIR | StyleAccessClassExpressionHIR;

export function readSourceExpressionRenameTarget(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: SourceRenameQueryOptions = {},
) {
  const expression = ctx.expression;
  if (expression.kind === "template" || expression.kind === "symbolRef") {
    return { kind: "blocked", reason: "dynamicExpression" } as const;
  }
  if (expression.kind !== "literal" && expression.kind !== "styleAccess") {
    return { kind: "miss" } as const;
  }

  if (usesRustSourceResolutionBackend(resolveSelectedQueryBackendKind(options.env))) {
    const rustResult = readSourceExpressionRenameTargetFromRust(
      expression,
      params,
      deps,
      options.readRustSourceResolutionSelectorMatch ?? resolveRustSourceResolutionSelectorMatch,
    );
    if (rustResult) return rustResult;
  }

  if (!ctx.styleDocument) return { kind: "miss" } as const;
  return readExpressionRenameTarget(expression, ctx.styleDocument, deps);
}

export function planSourceExpressionRename(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  newName: string,
  options: SourceRenameQueryOptions = {},
) {
  const result = readSourceExpressionRenameTarget(ctx, params, deps, options);
  if (result.kind !== "target") return null;
  return planSelectorRename(result.target, newName);
}

function readSourceExpressionRenameTargetFromRust(
  expression: RenameableSourceExpression,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  readRustSourceResolutionSelectorMatch: typeof resolveRustSourceResolutionSelectorMatch,
): SelectorRenameReadResult | null {
  const match = readRustSourceResolutionSelectorMatch(
    {
      uri: params.documentUri,
      content: params.content,
      filePath: params.filePath,
      version: params.version,
    },
    expression.id,
    expression.scssModulePath,
    deps,
  );
  if (!match || match.selectorNames.length === 0) return null;

  const styleDocument = deps.styleDocumentForPath(match.styleFilePath);
  if (!styleDocument) return null;

  const selector = pickRustRenameSelector(styleDocument, expression.className, match.selectorNames);
  if (!selector) return null;

  return finalizeRustSourceRenameTarget(
    expression,
    match.styleFilePath,
    styleDocument,
    selector,
    deps,
  );
}

function pickRustRenameSelector(
  styleDocument: StyleDocumentHIR,
  expressionClassName: string,
  selectorNames: readonly string[],
): SelectorDeclHIR | null {
  const selectorNameSet = new Set(selectorNames);
  const exactMatch =
    styleDocument.selectors.find(
      (candidate): candidate is SelectorDeclHIR =>
        candidate.name === expressionClassName && selectorNameSet.has(candidate.canonicalName),
    ) ?? null;
  if (exactMatch) return exactMatch;

  if (selectorNames.length !== 1) return null;
  return (
    styleDocument.selectors.find(
      (candidate): candidate is SelectorDeclHIR => candidate.canonicalName === selectorNames[0],
    ) ?? null
  );
}

function finalizeRustSourceRenameTarget(
  expression: RenameableSourceExpression,
  scssPath: string,
  styleDocument: StyleDocumentHIR,
  selector: SelectorDeclHIR,
  deps: Pick<ProviderDeps, "settings" | "semanticReferenceIndex" | "styleDependencyGraph">,
): SelectorRenameReadResult {
  const aliasMode = deps.settings.scss.classnameTransform;
  const rewritePolicy = readStyleSelectorRewritePolicy({
    styleDocument,
    selector,
    aliasMode,
    rejectAliasSelectorViews: false,
  });
  if (rewritePolicy.kind === "blocked") {
    return rewritePolicy;
  }

  const rewriteSafety = readSelectorRewriteSafetySummary(
    deps,
    scssPath,
    rewritePolicy.summary.canonicalName,
  );
  if (rewriteSafety.hasBlockingStyleDependencyReferences) {
    return { kind: "blocked", reason: "styleDependencyReferences" };
  }
  if (rewriteSafety.hasBlockingExpandedReferences) {
    return { kind: "blocked", reason: "expandedReferences" };
  }

  const target: SelectorRenameTarget = {
    scssPath,
    scssUri: pathToFileUrl(scssPath),
    styleDocument,
    selector,
    styleRewritePolicy: rewritePolicy.summary,
    placeholder: expression.className,
    placeholderRange: expression.range,
    rewriteSafety,
    aliasMode,
  };
  return {
    kind: "target",
    target,
  };
}
