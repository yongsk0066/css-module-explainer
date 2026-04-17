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

export interface BuildSelectedQueryResultsV2Options {
  readonly workspaceRoot: string;
  readonly sourceDocuments: readonly SourceDocumentSnapshot[];
  readonly styleFiles: readonly string[];
  readonly analysisCache: DocumentAnalysisCache;
  readonly styleDocumentForPath: (filePath: string) => StyleDocumentHIR | null;
  readonly typeResolver: TypeResolver;
  readonly semanticReferenceIndex: WorkspaceSemanticWorkspaceReferenceIndex;
  readonly styleDependencyGraph: WorkspaceStyleDependencyGraph;
}

export function buildSelectedQueryResultsV2(
  options: BuildSelectedQueryResultsV2Options,
): readonly QueryResultV2[] {
  const results: QueryResultV2[] = [];

  for (const document of options.sourceDocuments) {
    const analysis = options.analysisCache.get(
      document.uri,
      document.content,
      document.filePath,
      document.version,
    );

    for (const expression of analysis.sourceDocument.classExpressions) {
      const resolution = readSourceExpressionResolution(
        {
          expression,
          sourceFile: analysis.sourceFile,
        },
        {
          styleDocumentForPath: options.styleDocumentForPath,
          typeResolver: options.typeResolver,
          filePath: document.filePath,
          workspaceRoot: options.workspaceRoot,
          sourceBinder: analysis.sourceBinder,
          sourceBindingGraph: analysis.sourceBindingGraph,
        },
      );
      const semantics = readExpressionSemantics(
        {
          expression,
          sourceFile: analysis.sourceFile,
        },
        {
          styleDocumentForPath: options.styleDocumentForPath,
          typeResolver: options.typeResolver,
          filePath: document.filePath,
          workspaceRoot: options.workspaceRoot,
          sourceBinder: analysis.sourceBinder,
          sourceBindingGraph: analysis.sourceBindingGraph,
        },
      );

      results.push(expressionSemanticsResultV2(document.filePath, semantics));
      results.push(
        sourceExpressionResolutionResultV2(document.filePath, expression.id, resolution),
      );
    }
  }

  for (const styleFile of options.styleFiles) {
    const styleDocument = options.styleDocumentForPath(styleFile);
    if (!styleDocument) continue;
    for (const selector of listCanonicalSelectors(styleDocument)) {
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
