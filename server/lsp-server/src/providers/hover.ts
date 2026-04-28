import type { Hover } from "vscode-languageserver/node";
import {
  resolveSourceExpressionHoverResult,
  resolveSourceExpressionHoverResultAsync,
} from "../../../engine-host-node/src/source-hover-query";
import type { RustSelectedQueryBackendJsonRunnerAsync } from "../../../engine-host-node/src/selected-query-backend";
import { resolveStyleHoverResult } from "../../../engine-host-node/src/style-hover-query";
import { findLangForPath } from "../../../engine-core-ts/src/core/scss/lang-registry";
import { toLspRange } from "./lsp-adapters";
import {
  renderCustomPropertyHover,
  renderHover,
  renderKeyframesHover,
  renderSassSymbolHover,
  renderSelectorHover,
  renderValueHover,
} from "./hover-renderer";
import { wrapHandler } from "./_wrap-handler";
import { withSourceExpressionAtCursor, type SourceExpressionContext } from "./cursor-dispatch";
import { getRustSelectedQueryBackendJsonRunnerAsync } from "./selected-query-runner";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/hover` for any class expression under the cursor.
 *
 * Dispatches through the unified expression cursor stage.
 * Source-side semantic resolution runs through the Node host boundary so
 * hover, definition, and rename logic can move off direct core query calls
 * incrementally. The resulting selector list is handed to the pure
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
    const rustRunner = getRustSelectedQueryBackendJsonRunnerAsync(deps);
    if (rustRunner) {
      return withSourceExpressionAtCursor(params, deps, (ctx) =>
        buildHoverAsync(ctx, params, deps, maxCandidates, rustRunner),
      );
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
  const result = resolveSourceExpressionHoverResult(ctx, params, deps);
  const markdown = renderHover({
    expression: ctx.expression,
    scssModulePath: ctx.expression.scssModulePath,
    selectors: result.selectors,
    dynamicExplanation: result.dynamicExplanation,
    styleDependenciesBySelector: result.styleDependenciesBySelector,
    workspaceRoot: deps.workspaceRoot,
    maxCandidates,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.expression.range),
    contents: { kind: "markdown", value: markdown },
  };
}

async function buildHoverAsync(
  ctx: SourceExpressionContext,
  params: CursorParams,
  deps: ProviderDeps,
  maxCandidates: number,
  rustRunner: RustSelectedQueryBackendJsonRunnerAsync,
): Promise<Hover | null> {
  const result = await resolveSourceExpressionHoverResultAsync(ctx, params, deps, {
    runRustSelectedQueryBackendJsonAsync: rustRunner,
  });
  const markdown = renderHover({
    expression: ctx.expression,
    scssModulePath: ctx.expression.scssModulePath,
    selectors: result.selectors,
    dynamicExplanation: result.dynamicExplanation,
    styleDependenciesBySelector: result.styleDependenciesBySelector,
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
  const styleHover = resolveStyleHoverResult(
    {
      filePath: params.filePath,
      line: params.line,
      character: params.character,
    },
    deps,
  );
  if (!styleHover) return null;

  const markdown =
    styleHover.kind === "selector"
      ? renderSelectorHover({
          selector: styleHover.selector,
          ...(styleHover.headingName ? { headingName: styleHover.headingName } : {}),
          ...(styleHover.note ? { note: styleHover.note } : {}),
          scssModulePath: styleHover.scssModulePath,
          usageSummary: styleHover.usageSummary,
          styleDependencies: styleHover.styleDependencies,
          workspaceRoot: deps.workspaceRoot,
        })
      : styleHover.kind === "keyframes"
        ? renderKeyframesHover({
            keyframes: styleHover.keyframes,
            ...(styleHover.headingName ? { headingName: styleHover.headingName } : {}),
            ...(styleHover.note ? { note: styleHover.note } : {}),
            scssModulePath: styleHover.scssModulePath,
            referenceCount: styleHover.referenceCount,
            workspaceRoot: deps.workspaceRoot,
          })
        : styleHover.kind === "value"
          ? renderValueHover({
              valueDecl: styleHover.valueDecl,
              ...(styleHover.headingName ? { headingName: styleHover.headingName } : {}),
              ...(styleHover.note ? { note: styleHover.note } : {}),
              scssModulePath: styleHover.scssModulePath,
              referenceCount: styleHover.referenceCount,
              workspaceRoot: deps.workspaceRoot,
            })
          : styleHover.kind === "customProperty"
            ? renderCustomPropertyHover({
                customPropertyDecl: styleHover.customPropertyDecl,
                ...(styleHover.headingName ? { headingName: styleHover.headingName } : {}),
                ...(styleHover.note ? { note: styleHover.note } : {}),
                scssModulePath: styleHover.scssModulePath,
                referenceCount: styleHover.referenceCount,
                workspaceRoot: deps.workspaceRoot,
              })
            : renderSassSymbolHover({
                sassSymbolDecl: styleHover.sassSymbolDecl,
                ...(styleHover.headingName ? { headingName: styleHover.headingName } : {}),
                ...(styleHover.note ? { note: styleHover.note } : {}),
                scssModulePath: styleHover.scssModulePath,
                referenceCount: styleHover.referenceCount,
                workspaceRoot: deps.workspaceRoot,
              });
  return {
    range: toLspRange(styleHover.range),
    contents: { kind: "markdown", value: markdown },
  };
}
