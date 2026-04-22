import { readCompletionContext } from "../../engine-core-ts/src/core/query";
import type { SelectorDeclHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { CursorParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export function resolveSourceCompletionSelectors(
  params: CursorParams,
  deps: Pick<ProviderDeps, "analysisCache" | "styleDocumentForPath">,
): readonly SelectorDeclHIR[] {
  const entry = deps.analysisCache.get(
    params.documentUri,
    params.content,
    params.filePath,
    params.version,
  );
  if (
    entry.sourceDocument.utilityBindings.length === 0 &&
    entry.sourceDocument.styleImports.length === 0
  ) {
    return [];
  }

  const textBefore = getTextBefore(params.content, params.line, params.character);
  const ctx = readCompletionContext(entry, textBefore);
  if (!ctx) return [];

  const styleDocument = deps.styleDocumentForPath(ctx.scssModulePath);
  if (!styleDocument || styleDocument.selectors.length === 0) return [];
  return styleDocument.selectors;
}

function getTextBefore(content: string, line: number, character: number): string {
  let offset = 0;
  for (let i = 0; i < line; i++) {
    const nl = content.indexOf("\n", offset);
    if (nl === -1) return content;
    offset = nl + 1;
  }
  return content.slice(0, offset + character);
}
