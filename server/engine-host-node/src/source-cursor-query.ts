import {
  readSourceExpressionContextAtCursor,
  type SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import type { CursorParams, ProviderDeps } from "./provider-deps";

export type { SourceExpressionContext } from "../../engine-core-ts/src/core/query";

export function resolveSourceExpressionContextAtCursor(
  params: CursorParams,
  deps: Pick<ProviderDeps, "analysisCache" | "styleDocumentForPath">,
): SourceExpressionContext | null {
  return readSourceExpressionContextAtCursor(params, deps);
}
