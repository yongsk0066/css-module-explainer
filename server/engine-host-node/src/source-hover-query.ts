import type {
  DynamicHoverExplanation,
  SelectorStyleDependencySummary,
  SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import {
  buildDynamicExpressionExplanation,
  findCanonicalSelector,
  readSelectorStyleDependencySummary,
  resolveRefDetails,
} from "../../engine-core-ts/src/core/query";
import type { CursorParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  buildExpressionSemanticsSummaryFromRustPayload,
  resolveRustExpressionSemanticsPayload,
} from "./expression-semantics-query-backend";
import {
  resolveRustSourceResolutionSelectorMatch,
  resolveSelectedQueryBackendKind,
} from "./source-resolution-query-backend";

export interface SourceHoverQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSourceResolutionSelectorMatch?: typeof resolveRustSourceResolutionSelectorMatch;
  readonly readRustExpressionSemanticsPayload?: typeof resolveRustExpressionSemanticsPayload;
}

export interface SourceHoverResult {
  readonly selectors: ReturnType<typeof resolveRefDetails>["selectors"];
  readonly dynamicExplanation: DynamicHoverExplanation | null;
  readonly styleDependenciesBySelector: ReadonlyMap<string, SelectorStyleDependencySummary>;
}

export function resolveSourceExpressionHoverResult(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "styleDependencyGraph"
    | "settings"
  >,
  options: SourceHoverQueryOptions = {},
): SourceHoverResult {
  const result = resolveRefDetails(ctx, {
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });

  const backend = resolveSelectedQueryBackendKind(options.env);
  if (backend === "rust-expression-semantics") {
    const rustResult = resolveHoverFromRustExpressionSemantics(
      ctx,
      params,
      deps,
      options.readRustExpressionSemanticsPayload ?? resolveRustExpressionSemanticsPayload,
    );
    if (rustResult) return rustResult;
  }
  const selectors =
    backend === "rust-source-resolution"
      ? (resolveSelectorsFromRustSourceResolution(
          ctx,
          params,
          deps,
          options.readRustSourceResolutionSelectorMatch ?? resolveRustSourceResolutionSelectorMatch,
        ) ?? result.selectors)
      : result.selectors;

  return {
    selectors,
    dynamicExplanation: result.dynamicExplanation,
    styleDependenciesBySelector: new Map(
      selectors.map((selector) => [
        selector.canonicalName,
        readSelectorStyleDependencySummary(
          deps.styleDependencyGraph,
          ctx.expression.scssModulePath,
          selector.canonicalName,
        ),
      ]),
    ),
  };
}

function resolveHoverFromRustExpressionSemantics(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "styleDependencyGraph"
    | "settings"
  >,
  readRustSemanticsPayload: typeof resolveRustExpressionSemanticsPayload,
): SourceHoverResult | null {
  const payload = readRustSemanticsPayload(
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
  if (!payload || !payload.styleFilePath) return null;

  const styleDocument = deps.styleDocumentForPath(payload.styleFilePath);
  if (!styleDocument) return null;

  const selectors = payload.selectorNames
    .map((name) => {
      const selector =
        styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
      return selector ? findCanonicalSelector(styleDocument, selector) : null;
    })
    .filter(
      (selector): selector is ReturnType<typeof resolveRefDetails>["selectors"][number] =>
        selector !== null,
    );
  const semantics = buildExpressionSemanticsSummaryFromRustPayload(
    ctx.expression,
    styleDocument,
    selectors,
    payload,
  );

  return {
    selectors,
    dynamicExplanation: buildDynamicExpressionExplanation(ctx.expression, semantics),
    styleDependenciesBySelector: new Map(
      selectors.map((selector) => [
        selector.canonicalName,
        readSelectorStyleDependencySummary(
          deps.styleDependencyGraph,
          ctx.expression.scssModulePath,
          selector.canonicalName,
        ),
      ]),
    ),
  };
}

function resolveSelectorsFromRustSourceResolution(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  readRustSelectorMatch: typeof resolveRustSourceResolutionSelectorMatch,
): ReturnType<typeof resolveRefDetails>["selectors"] | null {
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
  if (!match) return null;
  const styleDocument = deps.styleDocumentForPath(match.styleFilePath);
  if (!styleDocument || match.selectorNames.length === 0) return null;

  return match.selectorNames
    .map((name) => {
      const selector =
        styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
      return selector ? findCanonicalSelector(styleDocument, selector) : null;
    })
    .filter(
      (selector): selector is ReturnType<typeof resolveRefDetails>["selectors"][number] =>
        selector !== null,
    );
}
