import type { Hover } from "vscode-languageserver/node";
import { findCanonicalSelector, findSelectorAtCursor } from "../core/query/find-style-selector";
import { readSelectorUsageSummary } from "../core/query/read-selector-usage";
import { resolveRefDetails } from "../core/query/resolve-ref";
import { readSelectorStyleDependencySummary } from "../core/query/read-selector-style-dependencies";
import { findLangForPath } from "../core/scss/lang-registry";
import { toLspRange } from "./lsp-adapters";
import { renderHover, renderSelectorHover } from "./hover-renderer";
import { wrapHandler } from "./_wrap-handler";
import { withSourceExpressionAtCursor, type SourceExpressionContext } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/hover` for any class expression under the cursor.
 *
 * Dispatches through the unified expression cursor stage.
 * Selector resolution runs through the shared ref query so
 * hover, definition, and rename logic all see the same semantic
 * targets. The resulting selector list is handed to the pure
 * `renderHover` markdown builder. An empty match yields a `null`
 * Hover; an exception is logged by `wrapHandler` and also returns
 * `null`.
 */
export const handleHover = wrapHandler<CursorParams, [maxCandidates?: number], Hover | null>(
  "hover",
  (params, deps, maxCandidates = 10) => {
    if (findLangForPath(params.filePath)) {
      return buildStyleHover(params, deps);
    }
    return withSourceExpressionAtCursor(params, deps, (ctx) =>
      buildHover(ctx, params, deps, maxCandidates),
    );
  },
  null,
);

function buildHover(
  ctx: SourceExpressionContext,
  params: CursorParams,
  deps: ProviderDeps,
  maxCandidates: number,
): Hover | null {
  const result = resolveRefDetails(ctx, {
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  const styleDependenciesBySelector = new Map(
    result.selectors.map((selector) => [
      selector.canonicalName,
      readSelectorStyleDependencySummary(
        deps.styleDependencyGraph,
        ctx.expression.scssModulePath,
        selector.canonicalName,
      ),
    ]),
  );
  const markdown = renderHover({
    expression: ctx.expression,
    scssModulePath: ctx.expression.scssModulePath,
    selectors: result.selectors,
    dynamicExplanation: result.dynamicExplanation,
    styleDependenciesBySelector,
    workspaceRoot: deps.workspaceRoot,
    maxCandidates,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.expression.range),
    contents: { kind: "markdown", value: markdown },
  };
}

function buildStyleHover(params: CursorParams, deps: ProviderDeps): Hover | null {
  const styleDocument = deps.styleDocumentForPath(params.filePath);
  if (!styleDocument) return null;

  const hit = findSelectorAtCursor(styleDocument, params.line, params.character);
  if (!hit) return null;

  const selector = findCanonicalSelector(styleDocument, hit);
  const usageSummary = readSelectorUsageSummary(
    {
      semanticReferenceIndex: deps.semanticReferenceIndex,
      styleDependencyGraph: deps.styleDependencyGraph,
      styleDocumentForPath: deps.styleDocumentForPath,
    },
    params.filePath,
    selector.canonicalName,
  );
  const styleDependencies = readSelectorStyleDependencySummary(
    deps.styleDependencyGraph,
    params.filePath,
    selector.canonicalName,
  );
  const markdown = renderSelectorHover({
    selector,
    scssModulePath: params.filePath,
    usageSummary,
    styleDependencies,
    workspaceRoot: deps.workspaceRoot,
  });

  return {
    range: toLspRange(hit.bemSuffix?.rawTokenRange ?? hit.range),
    contents: { kind: "markdown", value: markdown },
  };
}
