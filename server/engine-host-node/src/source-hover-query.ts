import type {
  DynamicHoverExplanation,
  SelectorStyleDependencySummary,
  SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import {
  readSelectorStyleDependencySummary,
  resolveRefDetails,
} from "../../engine-core-ts/src/core/query";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export interface SourceHoverResult {
  readonly selectors: ReturnType<typeof resolveRefDetails>["selectors"];
  readonly dynamicExplanation: DynamicHoverExplanation | null;
  readonly styleDependenciesBySelector: ReadonlyMap<string, SelectorStyleDependencySummary>;
}

export function resolveSourceExpressionHoverResult(
  ctx: SourceExpressionContext,
  filePath: string,
  deps: Pick<
    ProviderDeps,
    "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "styleDependencyGraph"
  >,
): SourceHoverResult {
  const result = resolveRefDetails(ctx, {
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
    filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  return {
    selectors: result.selectors,
    dynamicExplanation: result.dynamicExplanation,
    styleDependenciesBySelector: new Map(
      result.selectors.map((selector) => [
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
