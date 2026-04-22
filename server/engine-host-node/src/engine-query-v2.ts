import {
  describeAbstractValueReason,
  describeSelectorCertaintyReason,
  describeValueCertaintyReason,
  listCanonicalSelectors,
  readExpressionSemantics,
  readSelectorUsageSummary,
  readSourceExpressionResolution,
} from "../../engine-core-ts/src/core/query";
import {
  deriveSelectorCertaintyProfileV2,
  deriveValueCertaintyProfileV2,
} from "../../engine-core-ts/src/core/semantic/certainty";
import type { DocumentAnalysisCache } from "../../engine-core-ts/src/core/indexing/document-analysis-cache";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { WorkspaceSemanticWorkspaceReferenceIndex } from "../../engine-core-ts/src/core/semantic/workspace-reference-index";
import type { WorkspaceStyleDependencyGraph } from "../../engine-core-ts/src/core/semantic/style-dependency-graph";
import type { TypeResolver } from "../../engine-core-ts/src/core/ts/type-resolver";
import type {
  ExpressionSemanticsQueryResultV2,
  QueryResultV2,
  SelectorUsageQueryResultV2,
  SourceExpressionResolutionQueryResultV2,
} from "../../engine-core-ts/src/contracts";
import type { SourceDocumentSnapshot } from "./checker-host/workspace-check-support";
import { classifyValueDomainV2 } from "./query-metadata-v2";
import type { ClassnameTransformMode } from "../../engine-core-ts/src/core/scss/classname-transform";
import { DEFAULT_SETTINGS } from "../../engine-core-ts/src/settings";
import {
  buildExpressionSemanticsSummaryFromRustPayload,
  resolveRustExpressionSemanticsPayload,
} from "./expression-semantics-query-backend";
import {
  buildSourceResolutionSummaryFromRustPayload,
  resolveRustSourceResolutionPayload,
} from "./source-resolution-query-backend";
import { resolveSelectedQueryBackendKind } from "./selected-query-backend";
import { resolveRustSelectorUsagePayload } from "./selector-usage-query-backend";

export interface BuildSelectedQueryResultsV2Options {
  readonly workspaceRoot: string;
  readonly classnameTransform: ClassnameTransformMode;
  readonly pathAlias: Readonly<Record<string, string>>;
  readonly sourceDocuments: readonly SourceDocumentSnapshot[];
  readonly styleFiles: readonly string[];
  readonly analysisCache: DocumentAnalysisCache;
  readonly styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly semanticReferenceIndex: WorkspaceSemanticWorkspaceReferenceIndex;
  readonly styleDependencyGraph: WorkspaceStyleDependencyGraph;
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSourceResolutionPayload?: typeof resolveRustSourceResolutionPayload;
  readonly readRustExpressionSemanticsPayload?: typeof resolveRustExpressionSemanticsPayload;
  readonly readRustSelectorUsagePayload?: typeof resolveRustSelectorUsagePayload;
}

export function buildSelectedQueryResultsV2(
  options: BuildSelectedQueryResultsV2Options,
): readonly QueryResultV2[] {
  const results: QueryResultV2[] = [];
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);

  for (const document of options.sourceDocuments) {
    const analysis = options.analysisCache.get(
      document.uri,
      document.content,
      document.filePath,
      document.version,
    );

    for (const expression of analysis.sourceDocument.classExpressions) {
      const queryContext = {
        expression,
        sourceFile: analysis.sourceFile,
      } as const;
      const queryEnv = {
        styleDocumentForPath: options.styleDocumentForPath,
        typeResolver: options.typeResolver,
        filePath: document.filePath,
        workspaceRoot: options.workspaceRoot,
        sourceBinder: analysis.sourceBinder,
        sourceBindingGraph: analysis.sourceBindingGraph,
      } as const;
      const resolution = readSourceExpressionResolution(queryContext, queryEnv);
      const semantics = readExpressionSemantics(queryContext, queryEnv);
      const rustSourceResolutionPayload =
        selectedQueryBackend === "rust-source-resolution"
          ? (options.readRustSourceResolutionPayload ?? resolveRustSourceResolutionPayload)(
              {
                uri: document.uri,
                content: document.content,
                filePath: document.filePath,
                version: document.version,
              },
              expression.id,
              expression.scssModulePath,
              {
                analysisCache: options.analysisCache,
                styleDocumentForPath: options.styleDocumentForPath,
                typeResolver: options.typeResolver,
                workspaceRoot: options.workspaceRoot,
                settings: {
                  ...DEFAULT_SETTINGS,
                  scss: {
                    ...DEFAULT_SETTINGS.scss,
                    classnameTransform: options.classnameTransform,
                  },
                  pathAlias: options.pathAlias,
                },
              },
            )
          : null;
      const rustExpressionSemanticsPayload =
        selectedQueryBackend === "rust-expression-semantics"
          ? (options.readRustExpressionSemanticsPayload ?? resolveRustExpressionSemanticsPayload)(
              {
                uri: document.uri,
                content: document.content,
                filePath: document.filePath,
                version: document.version,
              },
              expression.id,
              expression.scssModulePath,
              {
                analysisCache: options.analysisCache,
                styleDocumentForPath: options.styleDocumentForPath,
                typeResolver: options.typeResolver,
                workspaceRoot: options.workspaceRoot,
                settings: {
                  ...DEFAULT_SETTINGS,
                  scss: {
                    ...DEFAULT_SETTINGS.scss,
                    classnameTransform: options.classnameTransform,
                  },
                  pathAlias: options.pathAlias,
                },
              },
            )
          : null;

      results.push(
        rustExpressionSemanticsPayload
          ? expressionSemanticsResultV2FromRustPayload(
              document.filePath,
              expression,
              rustExpressionSemanticsPayload,
              options.styleDocumentForPath,
            )
          : expressionSemanticsResultV2(document.filePath, semantics),
      );
      results.push(
        rustSourceResolutionPayload
          ? sourceExpressionResolutionResultV2FromRustPayload(
              document.filePath,
              expression.id,
              rustSourceResolutionPayload,
              options.styleDocumentForPath,
            )
          : sourceExpressionResolutionResultV2(document.filePath, expression.id, resolution),
      );
    }
  }

  for (const styleFile of options.styleFiles) {
    const styleDocument = options.styleDocumentForPath(styleFile);
    if (!styleDocument) continue;
    for (const selector of listCanonicalSelectors(styleDocument)) {
      const rustSelectorUsagePayload =
        selectedQueryBackend === "rust-selector-usage"
          ? (options.readRustSelectorUsagePayload ?? resolveRustSelectorUsagePayload)(
              options,
              styleFile,
              selector.canonicalName,
            )
          : null;
      if (rustSelectorUsagePayload) {
        results.push(
          selectorUsageResultV2FromRustPayload(
            styleFile,
            selector.canonicalName,
            rustSelectorUsagePayload,
          ),
        );
        continue;
      }

      const usage = readSelectorUsageSummary(
        {
          semanticReferenceIndex: options.semanticReferenceIndex,
          styleDependencyGraph: options.styleDependencyGraph,
          styleDocumentForPath: options.styleDocumentForPath,
        },
        styleFile,
        selector.canonicalName,
      );
      results.push(selectorUsageResultV2(styleFile, selector.canonicalName, usage));
    }
  }

  return results.toSorted(
    (a, b) =>
      a.filePath.localeCompare(b.filePath) ||
      a.kind.localeCompare(b.kind) ||
      a.queryId.localeCompare(b.queryId),
  );
}

function selectorUsageResultV2FromRustPayload(
  filePath: string,
  canonicalName: string,
  payload: ReturnType<typeof resolveRustSelectorUsagePayload> extends infer T
    ? NonNullable<T>
    : never,
): SelectorUsageQueryResultV2 {
  return {
    kind: "selector-usage",
    filePath,
    queryId: canonicalName,
    payload: {
      canonicalName: payload.canonicalName,
      totalReferences: payload.totalReferences,
      directReferenceCount: payload.directReferenceCount,
      editableDirectReferenceCount: payload.editableDirectReferenceCount,
      exactReferenceCount: payload.exactReferenceCount,
      inferredOrBetterReferenceCount: payload.inferredOrBetterReferenceCount,
      hasExpandedReferences: payload.hasExpandedReferences,
      hasStyleDependencyReferences: payload.hasStyleDependencyReferences,
      hasAnyReferences: payload.hasAnyReferences,
    },
  };
}

function expressionSemanticsResultV2FromRustPayload(
  filePath: string,
  expression: Parameters<typeof buildExpressionSemanticsSummaryFromRustPayload>[0],
  payload: Parameters<typeof buildExpressionSemanticsSummaryFromRustPayload>[3],
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
): ExpressionSemanticsQueryResultV2 {
  const styleDocument = payload.styleFilePath ? styleDocumentForPath(payload.styleFilePath) : null;
  const selectors =
    styleDocument?.selectors.filter((selector) =>
      payload.selectorNames.includes(selector.canonicalName),
    ) ?? [];
  const semantics = buildExpressionSemanticsSummaryFromRustPayload(
    expression,
    styleDocument,
    selectors,
    payload,
  );
  return expressionSemanticsResultV2(filePath, semantics);
}

function sourceExpressionResolutionResultV2FromRustPayload(
  filePath: string,
  expressionId: string,
  payload: Parameters<typeof buildSourceResolutionSummaryFromRustPayload>[2],
  styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null,
): SourceExpressionResolutionQueryResultV2 {
  const styleDocument = payload.styleFilePath ? styleDocumentForPath(payload.styleFilePath) : null;
  const selectors =
    styleDocument?.selectors.filter((selector) =>
      payload.selectorNames.includes(selector.canonicalName),
    ) ?? [];
  const resolution = buildSourceResolutionSummaryFromRustPayload(styleDocument, selectors, payload);
  return sourceExpressionResolutionResultV2(filePath, expressionId, resolution);
}

function expressionSemanticsResultV2(
  filePath: string,
  semantics: ReturnType<typeof readExpressionSemantics>,
): ExpressionSemanticsQueryResultV2 {
  const valueCertaintyProfile = deriveValueCertaintyProfileV2(
    semantics.abstractValue,
    semantics.valueCertainty,
  );
  const selectorCertaintyProfile = deriveSelectorCertaintyProfileV2(
    semantics.selectorNames.length,
    semantics.selectorCertainty,
    semantics.abstractValue,
  );
  const valueDomain = classifyValueDomainV2(semantics.abstractValue);
  const valueDomainReason = describeAbstractValueReason(semantics.abstractValue);
  const valueCertaintyReason = describeValueCertaintyReason(
    semantics.abstractValue,
    semantics.valueCertainty,
    semantics.reason,
  );
  const selectorCertaintyReason = describeSelectorCertaintyReason(
    semantics.abstractValue,
    semantics.selectorCertainty,
    semantics.selectorNames.length,
  );
  return {
    kind: "expression-semantics",
    filePath,
    queryId: semantics.expression.id,
    payload: {
      expressionId: semantics.expression.id,
      expressionKind: semantics.expression.kind,
      styleFilePath: semantics.styleDocument?.filePath ?? null,
      selectorNames: semantics.selectorNames,
      candidateNames: semantics.candidateNames,
      finiteValues: semantics.finiteValues,
      valueDomainKind: valueDomain.kind,
      ...(valueDomain.constraintKind ? { valueConstraintKind: valueDomain.constraintKind } : {}),
      ...(valueDomain.prefix ? { valuePrefix: valueDomain.prefix } : {}),
      ...(valueDomain.suffix ? { valueSuffix: valueDomain.suffix } : {}),
      ...(valueDomain.minLen !== undefined ? { valueMinLen: valueDomain.minLen } : {}),
      ...(valueDomain.maxLen !== undefined ? { valueMaxLen: valueDomain.maxLen } : {}),
      ...(valueDomain.charMust ? { valueCharMust: valueDomain.charMust } : {}),
      ...(valueDomain.charMay ? { valueCharMay: valueDomain.charMay } : {}),
      ...(valueDomain.mayIncludeOtherChars ? { valueMayIncludeOtherChars: true } : {}),
      ...(valueDomainReason ? { valueDomainReason } : {}),
      selectorCertainty: semantics.selectorCertainty,
      ...(selectorCertaintyProfile
        ? { selectorCertaintyShapeKind: selectorCertaintyProfile.shapeKind }
        : {}),
      ...(selectorCertaintyProfile?.selectorConstraintKind
        ? { selectorConstraintKind: selectorCertaintyProfile.selectorConstraintKind }
        : {}),
      ...(selectorCertaintyProfile
        ? { selectorCertaintyShapeLabel: selectorCertaintyProfile.shapeLabel }
        : {}),
      ...(selectorCertaintyReason ? { selectorCertaintyReason } : {}),
      ...(semantics.valueCertainty ? { valueCertainty: semantics.valueCertainty } : {}),
      ...(valueCertaintyProfile
        ? { valueCertaintyShapeKind: valueCertaintyProfile.shapeKind }
        : {}),
      ...(valueCertaintyProfile?.valueConstraintKind
        ? { valueCertaintyConstraintKind: valueCertaintyProfile.valueConstraintKind }
        : {}),
      ...(valueCertaintyProfile
        ? { valueCertaintyShapeLabel: valueCertaintyProfile.shapeLabel }
        : {}),
      ...(valueCertaintyReason ? { valueCertaintyReason } : {}),
      ...(semantics.reason ? { reason: semantics.reason } : {}),
    },
  };
}

function sourceExpressionResolutionResultV2(
  filePath: string,
  expressionId: string,
  resolution: ReturnType<typeof readSourceExpressionResolution>,
): SourceExpressionResolutionQueryResultV2 {
  const valueCertaintyProfile = deriveValueCertaintyProfileV2(
    resolution.abstractValue,
    resolution.valueCertainty,
  );
  const valueDomain = classifyValueDomainV2(resolution.abstractValue);
  const selectorCertaintyProfile = deriveSelectorCertaintyProfileV2(
    resolution.selectors.length,
    resolution.selectorCertainty,
    resolution.abstractValue,
  );
  const valueCertaintyReason = describeValueCertaintyReason(
    resolution.abstractValue,
    resolution.valueCertainty,
    resolution.reason,
  );
  const selectorCertaintyReason = describeSelectorCertaintyReason(
    resolution.abstractValue,
    resolution.selectorCertainty,
    resolution.selectors.length,
  );
  return {
    kind: "source-expression-resolution",
    filePath,
    queryId: expressionId,
    payload: {
      expressionId,
      styleFilePath: resolution.styleDocument?.filePath ?? null,
      selectorNames: resolution.selectors.map((selector) => selector.name),
      finiteValues: resolution.finiteValues,
      selectorCertainty: resolution.selectorCertainty,
      ...(selectorCertaintyProfile
        ? { selectorCertaintyShapeKind: selectorCertaintyProfile.shapeKind }
        : {}),
      ...(selectorCertaintyProfile?.selectorConstraintKind
        ? { selectorConstraintKind: selectorCertaintyProfile.selectorConstraintKind }
        : {}),
      ...(selectorCertaintyProfile
        ? { selectorCertaintyShapeLabel: selectorCertaintyProfile.shapeLabel }
        : {}),
      ...(selectorCertaintyReason ? { selectorCertaintyReason } : {}),
      ...(resolution.valueCertainty ? { valueCertainty: resolution.valueCertainty } : {}),
      ...(valueCertaintyProfile
        ? { valueCertaintyShapeKind: valueCertaintyProfile.shapeKind }
        : {}),
      ...(valueCertaintyProfile?.valueConstraintKind
        ? { valueCertaintyConstraintKind: valueCertaintyProfile.valueConstraintKind }
        : {}),
      ...(valueDomain.prefix ? { valuePrefix: valueDomain.prefix } : {}),
      ...(valueDomain.suffix ? { valueSuffix: valueDomain.suffix } : {}),
      ...(valueDomain.minLen !== undefined ? { valueMinLen: valueDomain.minLen } : {}),
      ...(valueDomain.maxLen !== undefined ? { valueMaxLen: valueDomain.maxLen } : {}),
      ...(valueDomain.charMust ? { valueCharMust: valueDomain.charMust } : {}),
      ...(valueDomain.charMay ? { valueCharMay: valueDomain.charMay } : {}),
      ...(valueDomain.mayIncludeOtherChars ? { valueMayIncludeOtherChars: true } : {}),
      ...(valueCertaintyProfile
        ? { valueCertaintyShapeLabel: valueCertaintyProfile.shapeLabel }
        : {}),
      ...(valueCertaintyReason ? { valueCertaintyReason } : {}),
      ...(resolution.reason ? { reason: resolution.reason } : {}),
    },
  };
}

function selectorUsageResultV2(
  filePath: string,
  canonicalName: string,
  usage: ReturnType<typeof readSelectorUsageSummary>,
): SelectorUsageQueryResultV2 {
  return {
    kind: "selector-usage",
    filePath,
    queryId: canonicalName,
    payload: {
      canonicalName,
      totalReferences: usage.totalReferences,
      directReferenceCount: usage.directReferenceCount,
      editableDirectReferenceCount: usage.editableDirectSites.length,
      exactReferenceCount: usage.exactSites.length,
      inferredOrBetterReferenceCount: usage.inferredOrBetterSites.length,
      hasExpandedReferences: usage.hasExpandedReferences,
      hasStyleDependencyReferences: usage.hasStyleDependencyReferences,
      hasAnyReferences: usage.hasAnyReferences,
    },
  };
}
