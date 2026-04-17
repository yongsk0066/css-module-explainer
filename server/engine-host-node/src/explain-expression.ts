import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { DynamicHoverExplanation } from "../../engine-core-ts/src/core/query";
import {
  readSourceExpressionContextAtCursor,
  resolveRefDetails,
} from "../../engine-core-ts/src/core/query";
import type { ClassnameTransformMode } from "../../engine-core-ts/src/core/scss/classname-transform";
import {
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
} from "./checker-host/workspace-check-support";

export interface ExplainExpressionOptions {
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly classnameTransform?: ClassnameTransformMode;
  readonly pathAlias?: Readonly<Record<string, string>>;
}

export interface ExplainExpressionResult {
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly expressionKind: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly dynamicExplanation: DynamicHoverExplanation | null;
}

export function explainExpressionAtLocation(
  options: ExplainExpressionOptions,
): ExplainExpressionResult | null {
  const styleHost = createWorkspaceStyleHost({
    styleFiles: [],
    classnameTransform: options.classnameTransform ?? "asIs",
  });
  const analysisHost = createWorkspaceAnalysisHost({
    workspaceRoot: options.workspaceRoot,
    classnameTransform: options.classnameTransform ?? "asIs",
    pathAlias: options.pathAlias ?? {},
    styleDocumentForPath: styleHost.styleDocumentForPath,
  });
  const content = readFileSync(options.filePath, "utf8");
  const documentUri = pathToFileURL(options.filePath).href;
  const ctx = readSourceExpressionContextAtCursor(
    {
      documentUri,
      content,
      filePath: options.filePath,
      version: 1,
      line: options.line,
      character: options.character,
    },
    {
      analysisCache: analysisHost.analysisCache,
      styleDocumentForPath: styleHost.styleDocumentForPath,
    },
  );
  if (!ctx) return null;

  const resolved = resolveRefDetails(ctx, {
    styleDocumentForPath: styleHost.styleDocumentForPath,
    typeResolver: analysisHost.typeResolver,
    filePath: options.filePath,
    workspaceRoot: options.workspaceRoot,
  });

  return {
    filePath: options.filePath,
    line: options.line,
    character: options.character,
    expressionKind: ctx.expression.kind,
    styleFilePath: ctx.expression.scssModulePath,
    selectorNames: resolved.selectors.map((selector) => selector.name),
    dynamicExplanation: resolved.dynamicExplanation,
  };
}
