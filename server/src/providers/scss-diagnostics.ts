import { DiagnosticSeverity, DiagnosticTag, type Diagnostic } from "vscode-languageserver/node";
import type { ScssClassMap } from "@css-module-explainer/shared";
import type { ReverseIndex } from "../core/indexing/reverse-index";
import { toLspRange } from "./lsp-adapters";

/**
 * Compute "unused selector" diagnostics for a single SCSS module file.
 *
 * For each class name in the classMap, checks the reverse index for
 * reference count. If zero, emits DiagnosticTag.Unnecessary (renders
 * as faded/dimmed text in VS Code).
 *
 * Caller is responsible for gating behind IndexerWorker.ready so
 * this function is never called before the initial index walk
 * completes.
 */
export function computeScssUnusedDiagnostics(
  scssPath: string,
  classMap: ScssClassMap,
  reverseIndex: ReverseIndex,
): Diagnostic[] {
  // If any unresolvable reference (variable or template) targets
  // this SCSS module, suppress ALL unused diagnostics. The
  // unresolvable reference might resolve to any class at runtime.
  const allSites = reverseIndex.findAllForScssPath(scssPath);
  const hasUnresolvableRef = allSites.some(
    (s) => s.match.kind === "variable" || s.match.kind === "template",
  );
  if (hasUnresolvableRef) return [];

  // Build a set of classes that are composed by other classes
  // within the same file. These are "used internally" even if
  // they have no external references.
  const composedClasses = new Set<string>();
  for (const selectorInfo of classMap.values()) {
    if (selectorInfo.composes) {
      for (const ref of selectorInfo.composes) {
        // Only same-file composes (no `from` and no `from global`).
        if (!ref.from && !ref.fromGlobal) {
          for (const name of ref.classNames) composedClasses.add(name);
        }
      }
    }
  }

  const diagnostics: Diagnostic[] = [];
  for (const [className, info] of classMap) {
    // Skip alias entries from classnameTransform expansion — the
    // original entry is walked separately and owns the diagnostic.
    // Without this guard, `camelCase` mode would emit two warnings
    // per unused class (`.orphan` + its `orphan` alias copy).
    if (info.originalName !== undefined) continue;
    if (composedClasses.has(className)) continue;
    const refCount = reverseIndex.count(scssPath, className);
    if (refCount === 0) {
      diagnostics.push({
        range: toLspRange(info.range),
        severity: DiagnosticSeverity.Hint,
        source: "css-module-explainer",
        message: `Selector '.${className}' is declared but never used.`,
        tags: [DiagnosticTag.Unnecessary],
      });
    }
  }
  return diagnostics;
}
