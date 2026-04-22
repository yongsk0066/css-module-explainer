import {
  planSelectorRename,
  readExpressionRenameTarget,
} from "../../engine-core-ts/src/core/rewrite";
import type { SourceExpressionContext } from "../../engine-core-ts/src/core/query";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export function readSourceExpressionRenameTarget(
  ctx: SourceExpressionContext,
  deps: Pick<ProviderDeps, "settings" | "semanticReferenceIndex" | "styleDependencyGraph">,
) {
  if (!ctx.styleDocument) return { kind: "miss" } as const;
  return readExpressionRenameTarget(ctx.expression, ctx.styleDocument, deps);
}

export function planSourceExpressionRename(
  ctx: SourceExpressionContext,
  deps: Pick<ProviderDeps, "settings" | "semanticReferenceIndex" | "styleDependencyGraph">,
  newName: string,
) {
  const result = readSourceExpressionRenameTarget(ctx, deps);
  if (result.kind !== "target") return null;
  return planSelectorRename(result.target, newName);
}
