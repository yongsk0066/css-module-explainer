import type { CxCallInfo, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import type { TypeResolver } from "../ts/type-resolver.js";

export interface ResolveArgs {
  readonly call: CxCallInfo;
  readonly classMap: ScssClassMap;
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

/**
 * Dispatch a CxCallInfo to concrete SelectorInfo values.
 *
 * Contract:
 *   - Returns `[]` when nothing matches. Providers treat `[]` as
 *     "nothing to show" (hover → null, definition → null,
 *     diagnostics → emit warning).
 *   - Returns a non-empty list when the call can be resolved,
 *     possibly to multiple candidates (template prefixes, union
 *     variables). Providers typically display a picker or a
 *     multi-candidate hover card.
 *
 * The function is pure — no I/O, no caching, no AST walking. It
 * is the single place where ScssClassMap, CxCallInfo, and
 * TypeResolver meet.
 */
export function resolveCxCallToSelectorInfos(args: ResolveArgs): SelectorInfo[] {
  const { call, classMap, typeResolver, filePath, workspaceRoot } = args;

  switch (call.kind) {
    case "static": {
      const info = classMap.get(call.className);
      return info ? [info] : [];
    }
    case "template": {
      const results: SelectorInfo[] = [];
      for (const info of classMap.values()) {
        if (info.name.startsWith(call.staticPrefix)) {
          results.push(info);
        }
      }
      return results;
    }
    case "variable": {
      const resolved = typeResolver.resolve(filePath, call.variableName, workspaceRoot);
      if (resolved.kind !== "union") return [];
      const results: SelectorInfo[] = [];
      for (const value of resolved.values) {
        const info = classMap.get(value);
        if (info) results.push(info);
      }
      return results;
    }
    default: {
      const _exhaustive: never = call;
      return _exhaustive;
    }
  }
}
