import type { Range } from "@css-module-explainer/shared";
import type {
  KeyframesDeclHIR,
  SelectorDeclHIR,
  ValueDeclHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import {
  readSourceExpressionResolution,
  type SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export interface SourceDefinitionTarget {
  readonly originRange: Range;
  readonly targetFilePath: string;
  readonly targetRange: Range;
  readonly targetSelectionRange: Range;
}

export function resolveSourceExpressionDefinitionTargets(
  ctx: SourceExpressionContext,
  filePath: string,
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
      filePath,
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
