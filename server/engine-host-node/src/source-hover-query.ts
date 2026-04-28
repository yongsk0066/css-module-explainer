import type {
  DynamicHoverExplanation,
  SelectorStyleDependencySummary,
  SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import {
  buildDynamicExpressionExplanation,
  findCanonicalSelector,
  findCanonicalSelectorsByName,
  readSelectorStyleDependencySummary,
  resolveRefDetails,
} from "../../engine-core-ts/src/core/query";
import type { CursorParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  buildExpressionSemanticsSummaryFromRustPayload,
  resolveRustExpressionSemanticsPayloadAsync,
  resolveRustExpressionSemanticsPayload,
} from "./expression-semantics-query-backend";
import {
  resolveRustSourceResolutionSelectorMatchAsync,
  resolveRustSourceResolutionSelectorMatch,
  resolveSelectedQueryBackendKind,
  usesRustExpressionSemanticsBackend,
  usesRustSourceResolutionBackend,
} from "./source-resolution-query-backend";
import type { RustSelectedQueryBackendJsonRunnerAsync } from "./selected-query-backend";

export interface SourceHoverQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSourceResolutionSelectorMatch?: typeof resolveRustSourceResolutionSelectorMatch;
  readonly readRustExpressionSemanticsPayload?: typeof resolveRustExpressionSemanticsPayload;
  readonly runRustSelectedQueryBackendJsonAsync?: RustSelectedQueryBackendJsonRunnerAsync;
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
  if (usesRustExpressionSemanticsBackend(backend)) {
    const rustResult = resolveHoverFromRustExpressionSemantics(
      ctx,
      params,
      deps,
      options.readRustExpressionSemanticsPayload ?? resolveRustExpressionSemanticsPayload,
    );
    if (rustResult && rustResult.selectors.length > 0) return rustResult;
  }
  const selectors = usesRustSourceResolutionBackend(backend)
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

export async function resolveSourceExpressionHoverResultAsync(
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
): Promise<SourceHoverResult> {
  const result = resolveRefDetails(ctx, {
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });

  const backend = resolveSelectedQueryBackendKind(options.env);
  if (usesRustExpressionSemanticsBackend(backend)) {
    const rustResult = await resolveHoverFromRustExpressionSemanticsAsync(
      ctx,
      params,
      deps,
      options.runRustSelectedQueryBackendJsonAsync,
    );
    if (rustResult && rustResult.selectors.length > 0) return rustResult;
  }
  const selectors = usesRustSourceResolutionBackend(backend)
    ? ((await resolveSelectorsFromRustSourceResolutionAsync(
        ctx,
        params,
        deps,
        options.runRustSelectedQueryBackendJsonAsync,
      )) ?? result.selectors)
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

  const selectors = payload.selectorNames.flatMap((name) => {
    const selectorsForName = findCanonicalSelectorsByName(styleDocument, name);
    if (selectorsForName.length > 0) return selectorsForName;
    const selector =
      styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
    return selector ? [findCanonicalSelector(styleDocument, selector)] : [];
  });
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

async function resolveHoverFromRustExpressionSemanticsAsync(
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
  runJson?: RustSelectedQueryBackendJsonRunnerAsync,
): Promise<SourceHoverResult | null> {
  const payload = await resolveRustExpressionSemanticsPayloadAsync(
    {
      uri: params.documentUri,
      content: params.content,
      filePath: params.filePath,
      version: params.version,
    },
    ctx.expression.id,
    ctx.expression.scssModulePath,
    deps,
    runJson,
  );
  if (!payload || !payload.styleFilePath) return null;

  const styleDocument = deps.styleDocumentForPath(payload.styleFilePath);
  if (!styleDocument) return null;

  const selectors = payload.selectorNames.flatMap((name) => {
    const selectorsForName = findCanonicalSelectorsByName(styleDocument, name);
    if (selectorsForName.length > 0) return selectorsForName;
    const selector =
      styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
    return selector ? [findCanonicalSelector(styleDocument, selector)] : [];
  });
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

  return match.selectorNames.flatMap((name) => {
    const selectorsForName = findCanonicalSelectorsByName(styleDocument, name);
    if (selectorsForName.length > 0) return selectorsForName;
    const selector =
      styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
    return selector ? [findCanonicalSelector(styleDocument, selector)] : [];
  });
}

async function resolveSelectorsFromRustSourceResolutionAsync(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  runJson?: RustSelectedQueryBackendJsonRunnerAsync,
): Promise<ReturnType<typeof resolveRefDetails>["selectors"] | null> {
  const match = await resolveRustSourceResolutionSelectorMatchAsync(
    {
      uri: params.documentUri,
      content: params.content,
      filePath: params.filePath,
      version: params.version,
    },
    ctx.expression.id,
    ctx.expression.scssModulePath,
    deps,
    runJson,
  );
  if (!match) return null;
  const styleDocument = deps.styleDocumentForPath(match.styleFilePath);
  if (!styleDocument || match.selectorNames.length === 0) return null;

  return match.selectorNames.flatMap((name) => {
    const selectorsForName = findCanonicalSelectorsByName(styleDocument, name);
    if (selectorsForName.length > 0) return selectorsForName;
    const selector =
      styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
    return selector ? [findCanonicalSelector(styleDocument, selector)] : [];
  });
}
