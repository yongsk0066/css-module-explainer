import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type {
  SelectorCertaintyShapeKindV2,
  StringConstraintKindV2,
  ValueCertaintyShapeKindV2,
  ValueDomainKindV2,
} from "../../engine-core-ts/src/contracts";
import type { DynamicHoverExplanation } from "../../engine-core-ts/src/core/query";
import {
  readSourceExpressionContextAtCursor,
  readSourceExpressionResolution,
  resolveRefDetails,
} from "../../engine-core-ts/src/core/query";
import {
  deriveSelectorCertaintyProfileV2,
  deriveValueCertaintyProfileV2,
} from "../../engine-core-ts/src/core/semantic/certainty";
import type { ClassnameTransformMode } from "../../engine-core-ts/src/core/scss/classname-transform";
import type { TypeFactBackendKind } from "./type-backend";
import {
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
} from "./checker-host/workspace-check-support";
import { classifyValueDomainV2 } from "./query-metadata-v2";

export interface ExplainExpressionOptions {
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly classnameTransform?: ClassnameTransformMode;
  readonly pathAlias?: Readonly<Record<string, string>>;
  readonly typeBackend?: TypeFactBackendKind;
  readonly env?: NodeJS.ProcessEnv;
}

export interface ExplainExpressionResult {
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly expressionKind: string;
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
  readonly dynamicExplanation: DynamicHoverExplanation | null;
  readonly analysisV2: {
    readonly valueDomainKind: ValueDomainKindV2;
    readonly valueConstraintKind?: StringConstraintKindV2;
    readonly valuePrefix?: string;
    readonly valueSuffix?: string;
    readonly valueMinLen?: number;
    readonly valueMaxLen?: number;
    readonly valueCharMust?: string;
    readonly valueCharMay?: string;
    readonly valueMayIncludeOtherChars?: boolean;
    readonly valueCertaintyShapeKind?: ValueCertaintyShapeKindV2;
    readonly valueCertaintyConstraintKind?: StringConstraintKindV2;
    readonly selectorCertaintyShapeKind?: SelectorCertaintyShapeKindV2;
    readonly selectorConstraintKind?: StringConstraintKindV2;
  };
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
    ...(options.typeBackend ? { typeBackend: options.typeBackend } : {}),
    env: options.env ?? process.env,
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
  const resolution = readSourceExpressionResolution(
    {
      expression: ctx.expression,
      sourceFile: ctx.entry.sourceFile,
      styleDocument: ctx.styleDocument,
    },
    {
      styleDocumentForPath: styleHost.styleDocumentForPath,
      typeResolver: analysisHost.typeResolver,
      filePath: options.filePath,
      workspaceRoot: options.workspaceRoot,
      sourceBinder: ctx.entry.sourceBinder,
      sourceBindingGraph: ctx.entry.sourceBindingGraph,
    },
  );
  const valueDomain = classifyValueDomainV2(resolution.abstractValue);
  const valueCertaintyProfile = deriveValueCertaintyProfileV2(
    resolution.abstractValue,
    resolution.valueCertainty,
  );
  const selectorCertaintyProfile = deriveSelectorCertaintyProfileV2(
    resolution.selectors.length,
    resolution.selectorCertainty,
    resolution.abstractValue,
  );

  return {
    filePath: options.filePath,
    line: options.line,
    character: options.character,
    expressionKind: ctx.expression.kind,
    styleFilePath: ctx.expression.scssModulePath,
    selectorNames: resolved.selectors.map((selector) => selector.name),
    dynamicExplanation: resolved.dynamicExplanation,
    analysisV2: {
      valueDomainKind: valueDomain.kind,
      ...(valueDomain.constraintKind ? { valueConstraintKind: valueDomain.constraintKind } : {}),
      ...(valueDomain.prefix ? { valuePrefix: valueDomain.prefix } : {}),
      ...(valueDomain.suffix ? { valueSuffix: valueDomain.suffix } : {}),
      ...(valueDomain.minLen !== undefined ? { valueMinLen: valueDomain.minLen } : {}),
      ...(valueDomain.maxLen !== undefined ? { valueMaxLen: valueDomain.maxLen } : {}),
      ...(valueDomain.charMust ? { valueCharMust: valueDomain.charMust } : {}),
      ...(valueDomain.charMay ? { valueCharMay: valueDomain.charMay } : {}),
      ...(valueDomain.mayIncludeOtherChars ? { valueMayIncludeOtherChars: true } : {}),
      ...(valueCertaintyProfile
        ? { valueCertaintyShapeKind: valueCertaintyProfile.shapeKind }
        : {}),
      ...(valueCertaintyProfile?.valueConstraintKind
        ? { valueCertaintyConstraintKind: valueCertaintyProfile.valueConstraintKind }
        : {}),
      ...(selectorCertaintyProfile
        ? { selectorCertaintyShapeKind: selectorCertaintyProfile.shapeKind }
        : {}),
      ...(selectorCertaintyProfile?.selectorConstraintKind
        ? { selectorConstraintKind: selectorCertaintyProfile.selectorConstraintKind }
        : {}),
    },
  };
}
