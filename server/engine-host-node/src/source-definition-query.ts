import type { Range } from "@css-module-explainer/shared";
import type {
  KeyframesDeclHIR,
  SelectorDeclHIR,
  ValueDeclHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import {
  findCanonicalSelector,
  readSourceExpressionResolution,
  type SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import type { CursorParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveRustSourceResolutionSelectorMatch,
  resolveSelectedQueryBackendKind,
  usesRustSourceResolutionBackend,
} from "./source-resolution-query-backend";

export interface SourceDefinitionTarget {
  readonly originRange: Range;
  readonly targetFilePath: string;
  readonly targetRange: Range;
  readonly targetSelectionRange: Range;
}

export interface SourceDefinitionQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSourceResolutionSelectorMatch?: typeof resolveRustSourceResolutionSelectorMatch;
}

export function resolveSourceExpressionDefinitionTargets(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  options: SourceDefinitionQueryOptions = {},
): readonly SourceDefinitionTarget[] {
  const backend = resolveSelectedQueryBackendKind(options.env);
  if (usesRustSourceResolutionBackend(backend)) {
    const rustTargets = resolveSourceDefinitionTargetsFromRust(
      ctx,
      params,
      deps,
      options.readRustSourceResolutionSelectorMatch ?? resolveRustSourceResolutionSelectorMatch,
    );
    if (rustTargets.length > 0) return rustTargets;
  }

  return resolveSourceDefinitionTargetsFromTypescript(ctx, params, deps);
}

function resolveSourceDefinitionTargetsFromTypescript(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "filePath">,
  deps: Pick<ProviderDeps, "styleDocumentForPath" | "typeResolver" | "workspaceRoot">,
): readonly SourceDefinitionTarget[] {
  const resolution = readSourceExpressionResolution(
    {
      expression: ctx.expression,
      sourceFile: ctx.entry.sourceFile,
      styleDocument: ctx.styleDocument,
    },
    {
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      filePath: params.filePath,
      workspaceRoot: deps.workspaceRoot,
      sourceBinder: ctx.entry.sourceBinder,
      sourceBindingGraph: ctx.entry.sourceBindingGraph,
    },
  );
  const styleDocument = resolution.styleDocument;
  if (!styleDocument || resolution.selectors.length === 0) return [];
  return resolution.selectors.map((selector) =>
    toSourceDefinitionTarget(ctx.expression.range, styleDocument.filePath, selector),
  );
}

function resolveSourceDefinitionTargetsFromRust(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  readRustSelectorMatch: typeof resolveRustSourceResolutionSelectorMatch,
): readonly SourceDefinitionTarget[] {
  const match = readRustSelectorMatch(
    {
      uri: params.documentUri,
      content: params.content,
      filePath: params.filePath,
      version: params.version,
    },
    ctx.expression.id,
    ctx.expression.scssModulePath,
    deps,
  );
  if (!match) return [];
  const styleDocument = deps.styleDocumentForPath(match.styleFilePath);
  if (!styleDocument || match.selectorNames.length === 0) return [];
  return match.selectorNames
    .map((name) => {
      const selector =
        styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
      return selector ? findCanonicalSelector(styleDocument, selector) : null;
    })
    .filter((selector): selector is SelectorDeclHIR => selector !== null)
    .map((selector) =>
      toSourceDefinitionTarget(ctx.expression.range, match.styleFilePath, selector),
    );
}

function toSourceDefinitionTarget(
  originRange: Range,
  targetFilePath: string,
  target: SelectorDeclHIR | KeyframesDeclHIR | ValueDeclHIR,
): SourceDefinitionTarget {
  return {
    originRange,
    targetFilePath,
    targetRange: target.ruleRange,
    targetSelectionRange: target.range,
  };
}
