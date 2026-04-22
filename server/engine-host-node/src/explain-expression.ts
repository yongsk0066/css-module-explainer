import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type {
  SelectorCertaintyShapeKindV2,
  StringConstraintKindV2,
  ValueCertaintyShapeKindV2,
  ValueDomainKindV2,
} from "../../engine-core-ts/src/contracts";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import type { DynamicHoverExplanation } from "../../engine-core-ts/src/core/query";
import {
  buildDynamicExpressionExplanation,
  readSourceExpressionContextAtCursor,
  readSourceExpressionResolution,
  resolveRefDetails,
} from "../../engine-core-ts/src/core/query";
import type { ExpressionSemanticsSummary } from "../../engine-core-ts/src/core/query/read-expression-semantics";
import {
  deriveSelectorCertaintyProfileV2,
  deriveValueCertaintyProfileV2,
} from "../../engine-core-ts/src/core/semantic/certainty";
import type { ClassnameTransformMode } from "../../engine-core-ts/src/core/scss/classname-transform";
import {
  TOP_CLASS_VALUE,
  charInclusionClassValue,
  compositeClassValue,
  finiteSetClassValue,
  prefixClassValue,
  prefixSuffixClassValue,
  suffixClassValue,
} from "../../engine-core-ts/src/core/abstract-value/class-value-domain";
import type { TypeFactBackendKind } from "./type-backend";
import {
  createWorkspaceAnalysisHost,
  createWorkspaceStyleHost,
} from "./checker-host/workspace-check-support";
import {
  resolveRustExpressionSemanticsPayload,
  type ExpressionSemanticsEvaluatorCandidatePayloadV0,
} from "./expression-semantics-query-backend";
import { classifyValueDomainV2 } from "./query-metadata-v2";
import { resolveSelectedQueryBackendKind } from "./selected-query-backend";

export interface ExplainExpressionOptions {
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly classnameTransform?: ClassnameTransformMode;
  readonly pathAlias?: Readonly<Record<string, string>>;
  readonly typeBackend?: TypeFactBackendKind;
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustExpressionSemanticsPayload?: typeof resolveRustExpressionSemanticsPayload;
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

  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env ?? process.env);
  if (selectedQueryBackend === "rust-expression-semantics") {
    const rustResult = resolveExplainExpressionViaRustSemantics(
      options,
      ctx,
      {
        analysisHost,
        styleHost,
        content,
        documentUri,
      },
      options.readRustExpressionSemanticsPayload ?? resolveRustExpressionSemanticsPayload,
    );
    if (rustResult) return rustResult;
  }

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

function resolveExplainExpressionViaRustSemantics(
  options: ExplainExpressionOptions,
  ctx: NonNullable<ReturnType<typeof readSourceExpressionContextAtCursor>>,
  runtime: {
    readonly analysisHost: ReturnType<typeof createWorkspaceAnalysisHost>;
    readonly styleHost: ReturnType<typeof createWorkspaceStyleHost>;
    readonly content: string;
    readonly documentUri: string;
  },
  readRustSemanticsPayload: typeof resolveRustExpressionSemanticsPayload,
): ExplainExpressionResult | null {
  const payload = readRustSemanticsPayload(
    {
      uri: runtime.documentUri,
      content: runtime.content,
      filePath: options.filePath,
      version: 1,
    },
    ctx.expression.id,
    ctx.expression.scssModulePath,
    {
      analysisCache: runtime.analysisHost.analysisCache,
      styleDocumentForPath: runtime.styleHost.styleDocumentForPath,
      typeResolver: runtime.analysisHost.typeResolver,
      workspaceRoot: options.workspaceRoot,
      settings: {
        scss: {
          classnameTransform: options.classnameTransform ?? "asIs",
        },
        pathAlias: options.pathAlias ?? {},
      },
    } as Pick<
      ProviderDeps,
      "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
    >,
  );
  if (!payload || !payload.styleFilePath) return null;

  const styleDocument = runtime.styleHost.styleDocumentForPath(payload.styleFilePath);
  const selectors =
    styleDocument?.selectors.filter((selector) => payload.selectorNames.includes(selector.name)) ??
    [];
  const semantics = buildExpressionSemanticsSummaryFromRustPayload(
    ctx,
    styleDocument,
    selectors,
    payload,
  );
  const dynamicExplanation = buildDynamicExpressionExplanation(ctx.expression, semantics);

  return {
    filePath: options.filePath,
    line: options.line,
    character: options.character,
    expressionKind: ctx.expression.kind,
    styleFilePath: payload.styleFilePath,
    selectorNames: payload.selectorNames,
    dynamicExplanation,
    analysisV2: {
      valueDomainKind: payload.valueDomainKind as ValueDomainKindV2,
      ...(payload.valueConstraintKind
        ? { valueConstraintKind: payload.valueConstraintKind as StringConstraintKindV2 }
        : {}),
      ...(payload.valuePrefix ? { valuePrefix: payload.valuePrefix } : {}),
      ...(payload.valueSuffix ? { valueSuffix: payload.valueSuffix } : {}),
      ...(payload.valueMinLen !== undefined ? { valueMinLen: payload.valueMinLen } : {}),
      ...(payload.valueMaxLen !== undefined ? { valueMaxLen: payload.valueMaxLen } : {}),
      ...(payload.valueCharMust ? { valueCharMust: payload.valueCharMust } : {}),
      ...(payload.valueCharMay ? { valueCharMay: payload.valueCharMay } : {}),
      ...(payload.valueMayIncludeOtherChars ? { valueMayIncludeOtherChars: true } : {}),
      ...(payload.valueCertaintyShapeKind
        ? { valueCertaintyShapeKind: payload.valueCertaintyShapeKind as ValueCertaintyShapeKindV2 }
        : {}),
      ...(payload.valueCertaintyConstraintKind
        ? {
            valueCertaintyConstraintKind:
              payload.valueCertaintyConstraintKind as StringConstraintKindV2,
          }
        : {}),
      ...(payload.selectorCertaintyShapeKind
        ? {
            selectorCertaintyShapeKind:
              payload.selectorCertaintyShapeKind as SelectorCertaintyShapeKindV2,
          }
        : {}),
      ...(payload.selectorConstraintKind
        ? { selectorConstraintKind: payload.selectorConstraintKind as StringConstraintKindV2 }
        : {}),
    },
  };
}

function buildExpressionSemanticsSummaryFromRustPayload(
  ctx: NonNullable<ReturnType<typeof readSourceExpressionContextAtCursor>>,
  styleDocument: ReturnType<ReturnType<typeof createWorkspaceStyleHost>["styleDocumentForPath"]>,
  selectors: NonNullable<
    ReturnType<ReturnType<typeof createWorkspaceStyleHost>["styleDocumentForPath"]>
  >["selectors"],
  payload: ExpressionSemanticsEvaluatorCandidatePayloadV0,
): ExpressionSemanticsSummary {
  const abstractValue = buildRustExpressionAbstractValue(payload);
  const selectorNames = selectors.map((selector) => selector.name);
  const reason = inferRustExpressionReason(payload);

  return {
    expression: ctx.expression,
    styleDocument,
    selectors,
    selectorNames: selectorNames.length > 0 ? selectorNames : payload.selectorNames,
    candidateNames: payload.candidateNames,
    finiteValues: payload.finiteValues ?? null,
    valueDomainKind: mapRustValueDomainKind(payload.valueDomainKind),
    ...(abstractValue ? { abstractValue } : {}),
    ...(payload.valueCertainty ? { valueCertainty: payload.valueCertainty } : {}),
    selectorCertainty: payload.selectorCertainty,
    ...(reason !== undefined ? { reason } : {}),
  };
}

function mapRustValueDomainKind(
  valueDomainKind: string,
): ExpressionSemanticsSummary["valueDomainKind"] {
  switch (valueDomainKind) {
    case "none":
    case "exact":
    case "finiteSet":
    case "prefix":
    case "top":
      return valueDomainKind;
    case "constrained":
      return "top";
    default:
      return "top";
  }
}

function buildRustExpressionAbstractValue(payload: ExpressionSemanticsEvaluatorCandidatePayloadV0) {
  switch (payload.valueDomainKind) {
    case "none":
      return undefined;
    case "exact": {
      const value = payload.finiteValues?.[0] ?? payload.candidateNames[0];
      return value ? finiteSetClassValue([value]) : undefined;
    }
    case "finiteSet":
      return payload.finiteValues?.length
        ? finiteSetClassValue(payload.finiteValues)
        : payload.candidateNames.length > 0
          ? finiteSetClassValue(payload.candidateNames)
          : undefined;
    case "prefix":
      return payload.valuePrefix ? prefixClassValue(payload.valuePrefix) : undefined;
    case "constrained":
      return buildRustConstrainedAbstractValue(payload);
    case "top":
      return TOP_CLASS_VALUE;
    default:
      return undefined;
  }
}

function buildRustConstrainedAbstractValue(
  payload: ExpressionSemanticsEvaluatorCandidatePayloadV0,
) {
  switch (payload.valueConstraintKind) {
    case "prefix":
      return payload.valuePrefix ? prefixClassValue(payload.valuePrefix) : TOP_CLASS_VALUE;
    case "suffix":
      return payload.valueSuffix ? suffixClassValue(payload.valueSuffix) : TOP_CLASS_VALUE;
    case "prefixSuffix":
      return prefixSuffixClassValue(
        payload.valuePrefix ?? "",
        payload.valueSuffix ?? "",
        payload.valueMinLen,
      );
    case "charInclusion":
      return charInclusionClassValue(
        payload.valueCharMust ?? "",
        payload.valueCharMay ?? "",
        undefined,
        Boolean(payload.valueMayIncludeOtherChars),
      );
    case "composite":
      return compositeClassValue({
        ...(payload.valuePrefix ? { prefix: payload.valuePrefix } : {}),
        ...(payload.valueSuffix ? { suffix: payload.valueSuffix } : {}),
        ...(payload.valueMinLen !== undefined ? { minLength: payload.valueMinLen } : {}),
        mustChars: payload.valueCharMust ?? "",
        mayChars: payload.valueCharMay ?? "",
        ...(payload.valueMayIncludeOtherChars ? { mayIncludeOtherChars: true } : {}),
      });
    default:
      return TOP_CLASS_VALUE;
  }
}

function inferRustExpressionReason(
  payload: ExpressionSemanticsEvaluatorCandidatePayloadV0,
): "flowLiteral" | "flowBranch" | undefined {
  if (payload.valueCertainty === "exact" && payload.selectorCertainty === "exact") {
    return "flowLiteral";
  }
  if (
    payload.finiteValues !== undefined ||
    payload.candidateNames.length > 1 ||
    payload.valueDomainKind === "constrained" ||
    payload.valueDomainKind === "top"
  ) {
    return "flowBranch";
  }
  return undefined;
}
