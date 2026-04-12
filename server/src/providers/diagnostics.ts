import {
  DiagnosticSeverity,
  type Diagnostic,
  type Range as LspRange,
} from "vscode-languageserver/node";
import type { ClassRef, ScssClassMap } from "@css-module-explainer/shared";
import { findClosestMatch } from "../core/util/text-utils";
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
 * Iterates every cached ClassRef whose origin is `cxCall` in the
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
        });
      }
    }

    // Fast path 2: cx-pipeline class diagnostics only fire when
    // `classnames/bind` is present. Pure `styles.x` access is
    // covered by TypeScript's own type checker.
    if (!params.content.includes("classnames/bind")) return diagnostics;

    const cxRefs = entry.classRefs.filter((r) => r.origin === "cxCall");
    if (cxRefs.length === 0) return diagnostics;

    // Per-ref isolation: a single throwing ref (e.g. a malformed
    // binding or a misbehaving TypeResolver entry) must NOT erase
    // every other diagnostic in the same document. The "log +
    // return empty result" boundary applies per-ref, not per-file.
    for (const ref of cxRefs) {
      try {
        const classMap = deps.scssClassMapForPath(ref.scssModulePath);
        if (!classMap) continue;
        const d = validateCall(ref, classMap, params, deps, severity);
        if (d) diagnostics.push(d);
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

function validateCall(
  ref: ClassRef,
  classMap: ScssClassMap,
  params: Pick<DocumentParams, "filePath">,
  deps: ProviderDeps,
  severity: DiagnosticSeverity,
): Diagnostic | null {
  const range = toLspRange(ref.originRange);
  switch (ref.kind) {
    case "static":
      return validateStaticRef(ref, classMap, deps, range, severity);
    case "template":
      return validateTemplateRef(ref, classMap, deps, range, severity);
    case "variable":
      return validateVariableRef(ref, classMap, params, deps, range, severity);
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}

function validateStaticRef(
  ref: Extract<ClassRef, { kind: "static" }>,
  classMap: ScssClassMap,
  deps: ProviderDeps,
  range: LspRange,
  severity: DiagnosticSeverity,
): Diagnostic | null {
  if (classMap.has(ref.className)) return null;
  const suggestion = findClosestMatch(ref.className, classMap.keys());
  const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
  return {
    range,
    severity,
    source: DIAGNOSTIC_SOURCE,
    message: `Class '.${ref.className}' not found in ${relativeScss(ref.scssModulePath, deps.workspaceRoot)}.${hint}`,
    data: suggestion ? { suggestion } : undefined,
  };
}

function validateTemplateRef(
  ref: Extract<ClassRef, { kind: "template" }>,
  classMap: ScssClassMap,
  deps: ProviderDeps,
  range: LspRange,
  severity: DiagnosticSeverity,
): Diagnostic | null {
  if (anyValueStartsWith(classMap, ref.staticPrefix)) return null;
  return {
    range,
    severity,
    source: DIAGNOSTIC_SOURCE,
    message: `No class starting with '${ref.staticPrefix}' found in ${relativeScss(ref.scssModulePath, deps.workspaceRoot)}.`,
  };
}

function validateVariableRef(
  ref: Extract<ClassRef, { kind: "variable" }>,
  classMap: ScssClassMap,
  params: Pick<DocumentParams, "filePath">,
  deps: ProviderDeps,
  range: LspRange,
  severity: DiagnosticSeverity,
): Diagnostic | null {
  const resolved = deps.typeResolver.resolve(params.filePath, ref.variableName, deps.workspaceRoot);
  if (resolved.kind !== "union") return null;
  const missing = resolved.values.filter((v) => !classMap.has(v));
  if (missing.length === 0) return null;
  return {
    range,
    severity,
    source: DIAGNOSTIC_SOURCE,
    message: `Missing class for union member${missing.length > 1 ? "s" : ""}: ${missing.map((m) => `'${m}'`).join(", ")}.`,
  };
}

function anyValueStartsWith(classMap: ScssClassMap, prefix: string): boolean {
  for (const name of classMap.keys()) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

function relativeScss(scssPath: string, workspaceRoot: string): string {
  if (scssPath.startsWith(workspaceRoot)) {
    return scssPath.slice(workspaceRoot.length + 1) || scssPath;
  }
  return scssPath;
}
