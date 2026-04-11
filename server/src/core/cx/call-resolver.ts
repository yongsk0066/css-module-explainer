import type {
  ClassRef,
  CxCallInfo,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import type { TypeResolver } from "../ts/type-resolver";

/**
 * The resolver accepts either a legacy `CxCallInfo` (still used by
 * the diagnostics provider during Wave 1) or a unified `ClassRef`
 * (used by the Stage-2-migrated hover/definition providers). Both
 * shapes share the discriminator fields this function reads
 * (`kind`, `className`, `staticPrefix`, `variableName`), so the
 * function body is identical for both. The union widens in
 * Stage 4.2.a when `CxCallInfo` is deleted.
 */
export interface ResolveArgs {
  readonly call: CxCallInfo | ClassRef;
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
