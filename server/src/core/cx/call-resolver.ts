import type { ClassRef, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import type { TypeResolver } from "../ts/type-resolver";

/**
 * Resolve a unified `ClassRef` against a `ScssClassMap`. The
 * function reads only the discriminator fields (`kind`,
 * `className`, `staticPrefix`, `variableName`) — origin
 * (cxCall vs styleAccess) does not affect resolution.
 */
export interface ResolveArgs {
  readonly ref: ClassRef;
  readonly classMap: ScssClassMap;
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

/**
 * Dispatch a ClassRef to concrete SelectorInfo values.
 *
 * Contract:
 *   - Returns `[]` when nothing matches. Providers treat `[]` as
 *     "nothing to show" (hover → null, definition → null,
 *     diagnostics → emit warning).
 *   - Returns a non-empty list when the ref can be resolved,
 *     possibly to multiple candidates (template prefixes, union
 *     variables). Providers typically display a picker or a
 *     multi-candidate hover card.
 *
 * The function is pure — no I/O, no caching, no AST walking. It
 * is the single place where ScssClassMap, ClassRef, and
 * TypeResolver meet.
 */
export function resolveClassRefToSelectorInfos(args: ResolveArgs): SelectorInfo[] {
  const { ref, classMap, typeResolver, filePath, workspaceRoot } = args;

  switch (ref.kind) {
    case "static": {
      const info = classMap.get(ref.className);
      return info ? [info] : [];
    }
    case "template": {
      const results: SelectorInfo[] = [];
      for (const info of classMap.values()) {
        if (info.name.startsWith(ref.staticPrefix)) {
          results.push(info);
        }
      }
      return results;
    }
    case "variable": {
      const resolved = typeResolver.resolve(filePath, ref.variableName, workspaceRoot);
      if (resolved.kind !== "union") return [];
      const results: SelectorInfo[] = [];
      for (const value of resolved.values) {
        const info = classMap.get(value);
        if (info) results.push(info);
      }
      return results;
    }
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}

/**
 * Context-shaped wrapper around `resolveClassRefToSelectorInfos`,
 * consumed by cursor-based providers that already hold a
 * `ClassRefContext` (ref + classMap) and a file path. Encapsulates
 * the static-vs-dynamic dispatch so hover and definition do not
 * each carry their own copy.
 */
export interface ClassRefResolveCtx {
  readonly ref: ClassRef;
  readonly classMap: ScssClassMap;
}

export interface ClassRefResolveEnv {
  readonly typeResolver: TypeResolver;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

export function resolveClassRefContext(
  ctx: ClassRefResolveCtx,
  env: ClassRefResolveEnv,
): SelectorInfo[] {
  return resolveClassRefToSelectorInfos({
    ref: ctx.ref,
    classMap: ctx.classMap,
    typeResolver: env.typeResolver,
    filePath: env.filePath,
    workspaceRoot: env.workspaceRoot,
  });
}
