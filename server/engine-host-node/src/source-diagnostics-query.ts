import {
  checkSourceDocument,
  type SourceCheckerFinding,
} from "../../engine-core-ts/src/core/checker";
import { enumerateFiniteClassValues } from "../../engine-core-ts/src/core/abstract-value/class-value-domain";
import { findInvalidClassReference } from "../../engine-core-ts/src/core/query";
import type { DocumentParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  buildExpressionSemanticsSummaryFromRustPayload,
  resolveRustExpressionSemanticsPayload,
} from "./expression-semantics-query-backend";
import {
  resolveSelectedQueryBackendKind,
  usesRustExpressionSemanticsBackend,
} from "./selected-query-backend";

export interface SourceDiagnosticsQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustExpressionSemanticsPayload?: typeof resolveRustExpressionSemanticsPayload;
}

export function resolveSourceDiagnosticFindings(
  params: DocumentParams,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "settings"
    | "logError"
  >,
  options: SourceDiagnosticsQueryOptions = {},
): readonly SourceCheckerFinding[] {
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  if (usesRustExpressionSemanticsBackend(selectedQueryBackend)) {
    return resolveSourceDiagnosticFindingsViaRustSemantics(
      params,
      deps,
      options.readRustExpressionSemanticsPayload ?? resolveRustExpressionSemanticsPayload,
    );
  }

  return checkSourceDocument(
    params,
    {
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      workspaceRoot: deps.workspaceRoot,
    },
    {
      includeMissingModule: deps.settings.diagnostics.missingModule,
      logError: deps.logError,
    },
  );
}

function resolveSourceDiagnosticFindingsViaRustSemantics(
  params: DocumentParams,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
    | "settings"
    | "logError"
  >,
  readRustSemanticsPayload: typeof resolveRustExpressionSemanticsPayload,
): readonly SourceCheckerFinding[] {
  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  const findings: SourceCheckerFinding[] = [];

  if (deps.settings.diagnostics.missingModule) {
    for (const imp of entry.stylesBindings.values()) {
      if (imp.kind !== "missing") continue;
      findings.push({
        category: "source",
        code: "missing-module",
        severity: "warning",
        range: imp.range,
        specifier: imp.specifier,
        absolutePath: imp.absolutePath,
      });
    }
  }

  for (const expression of entry.sourceDocument.classExpressions) {
    if (expression.origin !== "cxCall") continue;
    try {
      const styleDocument = deps.styleDocumentForPath(expression.scssModulePath);
      if (!styleDocument) continue;

      if (expression.kind !== "symbolRef") {
        const finding = findInvalidClassReference(expression, entry.sourceFile, styleDocument, {
          typeResolver: deps.typeResolver,
          filePath: params.filePath,
          workspaceRoot: deps.workspaceRoot,
          sourceBinder: entry.sourceBinder,
          sourceBindingGraph: entry.sourceBindingGraph,
        });
        if (!finding) continue;
        findings.push(mapInvalidClassFinding(finding, styleDocument.filePath));
        continue;
      }

      const fallbackFinding = createFallbackFindingReader({
        expression,
        sourceFile: entry.sourceFile,
        styleDocument,
        sourceBinder: entry.sourceBinder,
        sourceBindingGraph: entry.sourceBindingGraph,
        deps,
        filePath: params.filePath,
      });
      const payload = readRustSemanticsPayload(
        {
          uri: params.documentUri,
          content: params.content,
          filePath: params.filePath,
          version: params.version,
        },
        expression.id,
        expression.scssModulePath,
        deps,
      );
      if (!payload || !payload.styleFilePath) {
        const fallback = fallbackFinding();
        if (fallback) {
          findings.push(mapInvalidClassFinding(fallback, styleDocument.filePath));
        }
        continue;
      }

      const payloadStyleDocument = deps.styleDocumentForPath(payload.styleFilePath);
      if (!payloadStyleDocument) {
        const fallback = fallbackFinding();
        if (fallback) {
          findings.push(mapInvalidClassFinding(fallback, styleDocument.filePath));
        }
        continue;
      }
      const selectors =
        payloadStyleDocument.selectors.filter((selector) =>
          payload.selectorNames.includes(selector.name),
        ) ?? [];
      const semantics = buildExpressionSemanticsSummaryFromRustPayload(
        expression,
        payloadStyleDocument,
        selectors,
        payload,
      );
      if (!semantics.abstractValue || !semantics.reason || !semantics.valueCertainty) {
        const fallback = fallbackFinding();
        if (fallback) {
          findings.push(mapInvalidClassFinding(fallback, styleDocument.filePath));
        }
        continue;
      }

      const finiteValues =
        semantics.finiteValues ?? enumerateFiniteClassValues(semantics.abstractValue);
      if (!finiteValues) {
        if (semantics.selectors.length > 0) continue;
        findings.push({
          category: "source",
          code: "missing-resolved-class-domain",
          severity: "warning",
          range: expression.range,
          scssModulePath: payloadStyleDocument.filePath,
          abstractValue: semantics.abstractValue,
          valueCertainty: semantics.valueCertainty,
          selectorCertainty: semantics.selectorCertainty,
          reason: semantics.reason,
        });
        continue;
      }

      const missingValues = finiteValues.filter(
        (value) => !payloadStyleDocument.selectors.some((selector) => selector.name === value),
      );
      if (missingValues.length === 0) continue;
      findings.push({
        category: "source",
        code: "missing-resolved-class-values",
        severity: "warning",
        range: expression.range,
        scssModulePath: payloadStyleDocument.filePath,
        missingValues,
        abstractValue: semantics.abstractValue,
        valueCertainty: semantics.valueCertainty,
        selectorCertainty: semantics.selectorCertainty,
        reason: semantics.reason,
      });
    } catch (err) {
      deps.logError("diagnostics per-call validation failed", err);
    }
  }

  return findings;
}

function createFallbackFindingReader(args: {
  readonly expression: Parameters<typeof findInvalidClassReference>[0];
  readonly sourceFile: Parameters<typeof findInvalidClassReference>[1];
  readonly styleDocument: Parameters<typeof findInvalidClassReference>[2];
  readonly sourceBinder: Parameters<typeof findInvalidClassReference>[3]["sourceBinder"];
  readonly sourceBindingGraph: Parameters<
    typeof findInvalidClassReference
  >[3]["sourceBindingGraph"];
  readonly deps: Pick<ProviderDeps, "typeResolver" | "workspaceRoot">;
  readonly filePath: string;
}): () => ReturnType<typeof findInvalidClassReference> {
  let didRead = false;
  let fallback: ReturnType<typeof findInvalidClassReference> = null;
  return () => {
    if (!didRead) {
      didRead = true;
      fallback = findInvalidClassReference(args.expression, args.sourceFile, args.styleDocument, {
        typeResolver: args.deps.typeResolver,
        filePath: args.filePath,
        workspaceRoot: args.deps.workspaceRoot,
        ...(args.sourceBinder !== undefined ? { sourceBinder: args.sourceBinder } : {}),
        ...(args.sourceBindingGraph !== undefined
          ? { sourceBindingGraph: args.sourceBindingGraph }
          : {}),
      });
    }
    return fallback;
  };
}

function mapInvalidClassFinding(
  finding: NonNullable<ReturnType<typeof findInvalidClassReference>>,
  scssModulePath: string,
): SourceCheckerFinding {
  switch (finding.kind) {
    case "missingStaticClass":
      return {
        category: "source",
        code: "missing-static-class",
        severity: "warning",
        range: finding.range,
        scssModulePath,
        className: finding.expression.className,
        ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
      };
    case "missingTemplatePrefix":
      return {
        category: "source",
        code: "missing-template-prefix",
        severity: "warning",
        range: finding.range,
        scssModulePath,
        staticPrefix: finding.expression.staticPrefix,
      };
    case "missingResolvedClassValues":
      return {
        category: "source",
        code: "missing-resolved-class-values",
        severity: "warning",
        range: finding.range,
        scssModulePath,
        missingValues: finding.missingValues,
        abstractValue: finding.abstractValue,
        valueCertainty: finding.valueCertainty,
        selectorCertainty: finding.selectorCertainty,
        reason: finding.reason,
      };
    case "missingResolvedClassDomain":
      return {
        category: "source",
        code: "missing-resolved-class-domain",
        severity: "warning",
        range: finding.range,
        scssModulePath,
        abstractValue: finding.abstractValue,
        valueCertainty: finding.valueCertainty,
        selectorCertainty: finding.selectorCertainty,
        reason: finding.reason,
      };
    default:
      finding satisfies never;
      return finding;
  }
}
