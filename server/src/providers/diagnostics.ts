import {
  DiagnosticSeverity,
  type Diagnostic,
  type Range as LspRange,
} from "vscode-languageserver/node";
import type { ClassRef, ScssClassMap } from "@css-module-explainer/shared";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver";
import { findClosestMatch } from "../core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";
import type { DocumentParams, ProviderDeps } from "./cursor-dispatch";

/**
 * Compute diagnostics for an open document.
 *
 * Spec §4.5. Push-based: the composition root calls this on
 * `onDidChangeContent` (debounced to 200ms) and pipes the result
 * into `connection.sendDiagnostics(...)`.
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
    // Fast path: if the file has no binding at all, nothing to diagnose.
    // NOTE: do not widen to hasAnyStyleImport — diagnostics scope is
    // cx-pipeline calls only, and bare styles.x access is covered by TS.
    if (!params.content.includes("classnames/bind")) return [];

    const entry = deps.analysisCache.get(
      params.documentUri,
      params.content,
      params.filePath,
      params.version,
    );
    // Diagnostics scope is cx-calls only; styles.x property access is covered by TS.
    const cxRefs = entry.classRefs.filter((r) => r.origin === "cxCall");
    if (cxRefs.length === 0) return [];

    // Per-ref isolation: a single throwing ref (e.g. a malformed
    // binding or a misbehaving TypeResolver entry) must NOT erase
    // every other diagnostic in the same document. Spec §2.8 —
    // "log + return empty result" applies per-ref, not per-file.
    const diagnostics: Diagnostic[] = [];
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

function validateCall(
  ref: ClassRef,
  classMap: ScssClassMap,
  params: Pick<DocumentParams, "filePath">,
  deps: ProviderDeps,
  severity: DiagnosticSeverity,
): Diagnostic | null {
  const range: LspRange = toLspRange(ref.originRange);
  const source = "css-module-explainer";
  switch (ref.kind) {
    case "static": {
      if (classMap.has(ref.className)) return null;
      const suggestion = findClosestMatch(ref.className, classMap.keys());
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      return {
        range,
        severity,
        source,
        message: `Class '.${ref.className}' not found in ${relativeScss(ref.scssModulePath, deps.workspaceRoot)}.${hint}`,
        data: suggestion ? { suggestion } : undefined,
      };
    }
    case "template": {
      const hasPrefix = anyValueStartsWith(classMap, ref.staticPrefix);
      if (hasPrefix) return null;
      return {
        range,
        severity,
        source,
        message: `No class starting with '${ref.staticPrefix}' found in ${relativeScss(ref.scssModulePath, deps.workspaceRoot)}.`,
      };
    }
    case "variable": {
      const infos = resolveCxCallToSelectorInfos({
        call: ref,
        classMap,
        typeResolver: deps.typeResolver,
        filePath: params.filePath,
        workspaceRoot: deps.workspaceRoot,
      });
      const resolved = deps.typeResolver.resolve(
        params.filePath,
        ref.variableName,
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
