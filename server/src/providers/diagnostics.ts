import {
  DiagnosticSeverity,
  type Diagnostic,
  type Range as LspRange,
} from "vscode-languageserver/node";
import { findInvalidClassReference } from "../core/query/find-invalid-class-references";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import { pathToFileUrl } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import type { DocumentParams, ProviderDeps } from "./provider-deps";

/**
 * Compute diagnostics for an open document.
 *
 * Push-based: the composition root calls this on
 * `onDidChangeContent` (debounced) and pipes the result into
 * `connection.sendDiagnostics(...)`.
 *
 * Iterates every cached class expression whose origin is `cxCall` in the
 * document's analysis entry, classifies each, and emits a
 * Diagnostic for unresolved / missing class names. Returns [] for
 * clean documents — caller MUST still publish to clear prior
 * warnings.
 *
 * Error isolation is owned by `wrapHandler` at the entry level;
 * per-ref validation failures are caught inside so a single bad
 * ref cannot erase sibling diagnostics.
 */
export const computeDiagnostics = wrapHandler<
  DocumentParams,
  [severity?: DiagnosticSeverity],
  Diagnostic[]
>(
  "diagnostics",
  (params, deps, severity: DiagnosticSeverity = DiagnosticSeverity.Warning) => {
    // Fast path 1: file has no style import of any kind → nothing
    // to diagnose. The `.module.` check keeps files that only use
    // `styles.x` (no `classnames/bind` helpers) in scope so they
    // still receive the missing-module diagnostic below.
    if (!params.content.includes(".module.") && !params.content.includes("classnames/bind")) {
      return [];
    }

    const entry = deps.analysisCache.get(
      params.documentUri,
      params.content,
      params.filePath,
      params.version,
    );

    const diagnostics: Diagnostic[] = [];

    // Missing-module diagnostics fire for any file with a style
    // import, independent of whether the file uses cx() helpers.
    // Emits one diagnostic per unresolved specifier, underlining
    // the string literal only.
    if (deps.settings.diagnostics.missingModule) {
      for (const imp of entry.stylesBindings.values()) {
        if (imp.kind !== "missing") continue;
        diagnostics.push({
          range: toLspRange(imp.range),
          severity,
          source: DIAGNOSTIC_SOURCE,
          message: `Cannot resolve CSS Module '${imp.specifier}'. The file does not exist.`,
          code: "missing-module",
          data: {
            createModuleFile: {
              uri: pathToFileUrl(imp.absolutePath),
            },
          },
        });
      }
    }

    // Fast path 2: cx-pipeline class diagnostics only fire when
    // `classnames/bind` is present. Pure `styles.x` access is
    // covered by TypeScript's own type checker.
    if (!params.content.includes("classnames/bind")) return diagnostics;

    const cxExpressions = entry.sourceDocument.classExpressions.filter(
      (expression) => expression.origin === "cxCall",
    );
    if (cxExpressions.length === 0) return diagnostics;

    // Per-ref isolation: a single throwing ref (e.g. a malformed
    // binding or a misbehaving TypeResolver entry) must NOT erase
    // every other diagnostic in the same document. The "log +
    // return empty result" boundary applies per-ref, not per-file.
    for (const expression of cxExpressions) {
      try {
        const styleDocument = deps.styleDocumentForPath(expression.scssModulePath);
        if (!styleDocument) continue;
        const finding = findInvalidClassReference(expression, entry.sourceFile, styleDocument, {
          typeResolver: deps.typeResolver,
          filePath: params.filePath,
          workspaceRoot: deps.workspaceRoot,
          sourceBinder: entry.sourceBinder,
        });
        if (finding) diagnostics.push(toDiagnostic(finding, styleDocument, deps, severity));
      } catch (err) {
        deps.logError("diagnostics per-call validation failed", err);
        // continue to the next ref
      }
    }
    return diagnostics;
  },
  [],
);

const DIAGNOSTIC_SOURCE = "css-module-explainer";

function toDiagnostic(
  finding: NonNullable<ReturnType<typeof findInvalidClassReference>>,
  styleDocument: StyleDocumentHIR,
  deps: ProviderDeps,
  severity: DiagnosticSeverity,
): Diagnostic {
  const range: LspRange = toLspRange(finding.range);

  switch (finding.kind) {
    case "missingStaticClass": {
      const hint = finding.suggestion ? ` Did you mean '${finding.suggestion}'?` : "";
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: `Class '.${finding.expression.className}' not found in ${relativeScss(finding.expression.scssModulePath, deps.workspaceRoot)}.${hint}`,
        data: {
          ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
          createSelector: buildCreateSelectorActionData(
            finding.expression.className,
            finding.expression.scssModulePath,
            styleDocument,
          ),
        },
      };
    }
    case "missingTemplatePrefix":
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: `No class starting with '${finding.expression.staticPrefix}' found in ${relativeScss(finding.expression.scssModulePath, deps.workspaceRoot)}.`,
      };
    case "missingResolvedClassValues":
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: diagnosticMessageForResolvedValues(finding),
      };
    case "missingResolvedClassDomain":
      return {
        range,
        severity,
        source: DIAGNOSTIC_SOURCE,
        message: diagnosticMessageForResolvedDomain(finding),
      };
    default:
      finding satisfies never;
      return finding;
  }
}

function buildCreateSelectorActionData(
  className: string,
  scssModulePath: string,
  styleDocument: StyleDocumentHIR,
): {
  readonly uri: string;
  readonly range: LspRange;
  readonly newText: string;
} {
  const insertionRange = findSelectorInsertionRange(styleDocument);
  return {
    uri: pathToFileUrl(scssModulePath),
    range: insertionRange,
    newText:
      styleDocument.selectors.length > 0 ? `\n\n.${className} {\n}\n` : `.${className} {\n}\n`,
  };
}

function findSelectorInsertionRange(styleDocument: StyleDocumentHIR): LspRange {
  if (styleDocument.selectors.length === 0) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }

  let latest = styleDocument.selectors[0]!.ruleRange.end;
  for (const selector of styleDocument.selectors) {
    const end = selector.ruleRange.end;
    if (end.line > latest.line || (end.line === latest.line && end.character > latest.character)) {
      latest = end;
    }
  }

  return {
    start: { line: latest.line, character: latest.character },
    end: { line: latest.line, character: latest.character },
  };
}

function diagnosticMessageForResolvedValues(
  finding: Extract<
    NonNullable<ReturnType<typeof findInvalidClassReference>>,
    {
      kind: "missingResolvedClassValues";
    }
  >,
): string {
  if (finding.reason === "typeUnion") {
    return `Missing class for union member${finding.missingValues.length > 1 ? "s" : ""}: ${finding.missingValues.map((value) => `'${value}'`).join(", ")}.`;
  }
  if (finding.missingValues.length === 1 && finding.certainty === "exact") {
    return `Missing class for resolved value: '${finding.missingValues[0]}'.`;
  }
  return `Missing class for possible value${finding.missingValues.length > 1 ? "s" : ""}: ${finding.missingValues.map((value) => `'${value}'`).join(", ")}.`;
}

function diagnosticMessageForResolvedDomain(
  finding: Extract<
    NonNullable<ReturnType<typeof findInvalidClassReference>>,
    {
      kind: "missingResolvedClassDomain";
    }
  >,
): string {
  switch (finding.abstractValue.kind) {
    case "prefix":
      return `No class matched resolved prefix '${finding.abstractValue.prefix}'.`;
    case "top":
      return "Dynamic class value could not be matched to any known selector.";
    default:
      return "Resolved dynamic class domain did not match any known selector.";
  }
}

function relativeScss(scssPath: string, workspaceRoot: string): string {
  if (scssPath.startsWith(workspaceRoot)) {
    return scssPath.slice(workspaceRoot.length + 1) || scssPath;
  }
  return scssPath;
}
