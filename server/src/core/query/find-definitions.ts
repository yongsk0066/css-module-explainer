import {
  resolveRefSelectors,
  type ResolveRefQueryContext,
  type ResolveRefQueryEnv,
} from "./resolve-ref";
import type { SelectorDeclHIR } from "../hir/style-types";

export function findDefinitionSelectors(
  ctx: ResolveRefQueryContext,
  env: ResolveRefQueryEnv,
): readonly SelectorDeclHIR[] {
  return resolveRefSelectors(ctx, env);
}
