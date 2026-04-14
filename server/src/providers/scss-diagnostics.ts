import path from "node:path";
import { DiagnosticSeverity, DiagnosticTag, type Diagnostic } from "vscode-languageserver/node";
import type { ComposesRef, Range } from "@css-module-explainer/shared";
import type { StyleDocumentHIR } from "../core/hir/style-types";
import { readStyleModuleUsageSummary } from "../core/query";
import { pathToFileUrl } from "../core/util/text-utils";
import type { ProviderDeps } from "./provider-deps";
import { toLspRange } from "./lsp-adapters";

/**
 * Compute "unused selector" diagnostics for a single SCSS module file.
 *
 * Caller is responsible for gating behind IndexerWorker.ready so
 * this function is never called before the initial index walk
 * completes.
 */
export function computeScssUnusedDiagnostics(
  scssPath: string,
  styleDocument: StyleDocumentHIR,
  semanticReferenceIndex: ProviderDeps["semanticReferenceIndex"],
  styleDependencyGraph?: ProviderDeps["styleDependencyGraph"],
  styleDocumentForPath?: (filePath: string) => StyleDocumentHIR | null,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = readStyleModuleUsageSummary(
    scssPath,
    styleDocument,
    semanticReferenceIndex,
    styleDependencyGraph,
  ).unusedSelectors.map((finding) => ({
    range: toLspRange(finding.range),
    severity: DiagnosticSeverity.Hint,
    source: "css-module-explainer",
    message: `Selector '.${finding.canonicalName}' is declared but never used.`,
    tags: [DiagnosticTag.Unnecessary],
  }));

  if (!styleDocumentForPath) return diagnostics;

  for (const selector of styleDocument.selectors) {
    if (selector.viewKind !== "canonical") continue;
    for (const ref of selector.composes) {
      if (ref.fromGlobal) continue;

      const targetFilePath = ref.from
        ? path.resolve(path.dirname(styleDocument.filePath), ref.from)
        : styleDocument.filePath;
      const targetDocument = styleDocumentForPath(targetFilePath);
      if (!targetDocument) {
        diagnostics.push({
          range: toLspRange(rangeForComposesRef(selector, ref)),
          severity: DiagnosticSeverity.Warning,
          source: "css-module-explainer",
          message: `Cannot resolve composed CSS Module '${ref.from ?? "."}'.`,
          data: {
            createModuleFile: {
              uri: pathToFileUrl(targetFilePath),
            },
          },
        });
        continue;
      }

      for (const missing of unresolvedComposedClasses(selector, ref, targetDocument)) {
        diagnostics.push({
          range: toLspRange(missing.range),
          severity: DiagnosticSeverity.Warning,
          source: "css-module-explainer",
          message: messageForMissingComposedSelector(missing.className, ref.from),
        });
      }
    }
  }

  return diagnostics;
}

function unresolvedComposedClasses(
  selector: StyleDocumentHIR["selectors"][number],
  ref: ComposesRef,
  targetDocument: StyleDocumentHIR,
): ReadonlyArray<{ className: string; range: Range }> {
  const unresolved: Array<{ className: string; range: Range }> = [];
  const tokenByName = new Map(
    ref.classTokens?.map((token) => [token.className, token.range]) ?? [],
  );

  for (const className of ref.classNames) {
    const targetSelector =
      targetDocument.selectors.find(
        (candidate) => candidate.canonicalName === className && candidate.viewKind === "canonical",
      ) ?? targetDocument.selectors.find((candidate) => candidate.canonicalName === className);
    if (targetSelector) continue;
    const range = tokenByName.get(className) ?? rangeForComposesRef(selector, ref);
    unresolved.push({ className, range });
  }

  return unresolved;
}

function rangeForComposesRef(
  selector: StyleDocumentHIR["selectors"][number],
  ref: ComposesRef,
): Range {
  return ref.classTokens?.[0]?.range ?? selector.range;
}

function messageForMissingComposedSelector(className: string, from: string | undefined): string {
  if (from) {
    return `Selector '.${className}' not found in composed module '${from}'.`;
  }
  return `Selector '.${className}' not found in this file for composes.`;
}
