import {
  DiagnosticSeverity,
  type Diagnostic,
  type Range as LspRange,
} from "vscode-languageserver/node";
import type { CxCallInfo, ScssClassMap } from "@css-module-explainer/shared";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver";
import { findClosestMatch } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import type { DocumentParams, ProviderDeps } from "./cursor-dispatch";

/**
 * Compute diagnostics for an open document.
 *
 * Spec §4.5. Push-based: the composition root calls this on
 * `onDidChangeContent` (debounced to 200ms) and pipes the result
 * into `connection.sendDiagnostics(...)`.
 *
 * Iterates every cached CxCallInfo in the document's analysis
 * entry, classifies each, and emits a Diagnostic for unresolved
 * / missing class names. Returns [] for clean documents — caller
 * MUST still publish to clear prior warnings.
 */
export function computeDiagnostics(
  params: DocumentParams,
  deps: ProviderDeps,
  severity: DiagnosticSeverity = DiagnosticSeverity.Warning,
): Diagnostic[] {
  // Fast path: if the file has no binding at all, nothing to diagnose.
  if (!params.content.includes("classnames/bind")) return [];

  let entry;
  try {
    entry = deps.analysisCache.get(
      params.documentUri,
      params.content,
      params.filePath,
      params.version,
    );
  } catch (err) {
    deps.logError("diagnostics analysis failed", err);
    return [];
  }
  if (entry.calls.length === 0) return [];

  // Per-call isolation: a single throwing call (e.g. a malformed
  // binding or a misbehaving TypeResolver entry) must NOT erase
  // every other diagnostic in the same document. Spec §2.8 —
  // "log + return empty result" applies per-call, not per-file.
  const diagnostics: Diagnostic[] = [];
  for (const call of entry.calls) {
    try {
      const classMap = deps.scssClassMapFor(call.binding);
      if (!classMap) continue;
      const d = validateCall(call, classMap, params, deps, severity);
      if (d) diagnostics.push(d);
    } catch (err) {
      deps.logError("diagnostics per-call validation failed", err);
      // continue to the next call
    }
  }
  return diagnostics;
}

function validateCall(
  call: CxCallInfo,
  classMap: ScssClassMap,
  params: Pick<DocumentParams, "filePath">,
  deps: ProviderDeps,
  severity: DiagnosticSeverity,
): Diagnostic | null {
  const range: LspRange = toLspRange(call.originRange);
  const source = "css-module-explainer";
  switch (call.kind) {
    case "static": {
      if (classMap.has(call.className)) return null;
      const suggestion = findClosestMatch(call.className, classMap.keys());
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      return {
        range,
        severity,
        source,
        message: `Class '.${call.className}' not found in ${relativeScss(call.binding.scssModulePath, deps.workspaceRoot)}.${hint}`,
        data: suggestion ? { suggestion } : undefined,
      };
    }
    case "template": {
      const hasPrefix = anyValueStartsWith(classMap, call.staticPrefix);
      if (hasPrefix) return null;
      return {
        range,
        severity,
        source,
        message: `No class starting with '${call.staticPrefix}' found in ${relativeScss(call.binding.scssModulePath, deps.workspaceRoot)}.`,
      };
    }
    case "variable": {
      const infos = resolveCxCallToSelectorInfos({
        call,
        classMap,
        typeResolver: deps.typeResolver,
        filePath: params.filePath,
        workspaceRoot: deps.workspaceRoot,
      });
      const resolved = deps.typeResolver.resolve(
        params.filePath,
        call.variableName,
        deps.workspaceRoot,
      );
      if (resolved.kind !== "union") return null; // ignoreUnresolvableUnions = true
      if (infos.length === resolved.values.length) return null;
      const missing = resolved.values.filter((v) => !classMap.has(v));
      if (missing.length === 0) return null;
      return {
        range,
        severity,
        source,
        message: `Missing class for union member${missing.length > 1 ? "s" : ""}: ${missing.map((m) => `'${m}'`).join(", ")}.`,
      };
    }
  }
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
