import type { SelectorInfo } from "@css-module-explainer/shared";
import {
  resolveRefSelectorInfos,
  type ResolveRefQueryContext,
  type ResolveRefQueryEnv,
} from "./resolve-ref";

export function findDefinitionSelectorInfos(
  ctx: ResolveRefQueryContext,
  env: ResolveRefQueryEnv,
): readonly SelectorInfo[] {
  return resolveRefSelectorInfos(ctx, env);
}
