import { DiagnosticSeverity, DiagnosticTag, type Diagnostic } from "vscode-languageserver/node";
import type { Range, ScssClassMap } from "@css-module-explainer/shared";
import { canonicalNameOf } from "../scss/classname-transform";
import type { ReverseIndex } from "../indexing/reverse-index";
import type { SemanticWorkspaceReferenceIndex } from "../semantic/workspace-reference-index";

export function computeUnusedSelectorDiagnostics(
  scssPath: string,
  classMap: ScssClassMap,
  reverseIndex: ReverseIndex,
  semanticReferenceIndex: SemanticWorkspaceReferenceIndex,
): Diagnostic[] {
  const allSites = reverseIndex.findAllForScssPath(scssPath);
  const hasUnresolvableRef = allSites.some(
    (site) => site.match.kind === "variable" || site.match.kind === "template",
  );
  if (hasUnresolvableRef) return [];

  const composedClasses = new Set<string>();
  for (const selectorInfo of classMap.values()) {
    if (!selectorInfo.composes) continue;
    for (const ref of selectorInfo.composes) {
      if (!ref.from && !ref.fromGlobal) {
        for (const name of ref.classNames) composedClasses.add(name);
      }
    }
  }

  const diagnostics: Diagnostic[] = [];
  const emittedCanonical = new Set<string>();
  for (const info of classMap.values()) {
    const canonical = canonicalNameOf(info);
    if (emittedCanonical.has(canonical)) continue;
    emittedCanonical.add(canonical);
    if (composedClasses.has(canonical)) continue;

    const refCount = Math.max(
      semanticReferenceIndex.countSelectorReferences(scssPath, canonical),
      reverseIndex.count(scssPath, canonical),
    );
    if (refCount > 0) continue;

    diagnostics.push({
      range: toLspRange(info.range),
      severity: DiagnosticSeverity.Hint,
      source: "css-module-explainer",
      message: `Selector '.${canonical}' is declared but never used.`,
      tags: [DiagnosticTag.Unnecessary],
    });
  }

  return diagnostics;
}

function toLspRange(range: Range): { start: Range["start"]; end: Range["end"] } {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}
