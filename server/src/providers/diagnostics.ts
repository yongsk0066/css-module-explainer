import {
  DiagnosticSeverity,
  type Diagnostic,
  type Range as LspRange,
} from "vscode-languageserver/node";
import type { CxCallInfo, ScssClassMap } from "@css-module-explainer/shared";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver.js";
import { findClosestMatch } from "../core/util/text-utils.js";
import { toLspRange } from "./lsp-adapters.js";
import type { CursorParams, ProviderDeps } from "./provider-utils.js";

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
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: ProviderDeps,
): Diagnostic[] {
  try {
    // Fast path: if the file has no binding at all, nothing to
    // diagnose.
    if (!params.content.includes("classnames/bind")) return [];
    const entry = deps.analysisCache.get(
      params.documentUri,
      params.content,
      params.filePath,
      params.version,
    );
    if (entry.calls.length === 0) return [];

    const diagnostics: Diagnostic[] = [];
    // One classMap lookup per distinct binding — cheap amortized
    // cost because StyleIndexCache is content-hashed.
    const classMapCache = new Map<string, ScssClassMap | null>();
    const classMapFor = (binding: (typeof entry.calls)[number]["binding"]): ScssClassMap | null => {
      const key = binding.scssModulePath;
      if (classMapCache.has(key)) return classMapCache.get(key) ?? null;
      const map = deps.scssClassMapFor(binding);
      classMapCache.set(key, map);
      return map;
    };

    for (const call of entry.calls) {
      const classMap = classMapFor(call.binding);
      if (!classMap) continue;
      const d = validateCall(call, classMap, params, deps);
      if (d) diagnostics.push(d);
    }
    return diagnostics;
  } catch (err) {
    deps.logError?.("diagnostics computation failed", err);
    return [];
  }
}

function validateCall(
  call: CxCallInfo,
  classMap: ScssClassMap,
  params: Pick<CursorParams, "filePath">,
  deps: ProviderDeps,
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
        severity: DiagnosticSeverity.Warning,
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
        severity: DiagnosticSeverity.Warning,
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
        severity: DiagnosticSeverity.Warning,
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
