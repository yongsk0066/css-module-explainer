import type { Range } from "@css-module-explainer/shared";
import {
  findAnimationNameRefAtCursor,
  findCanonicalSelector,
  findComposesTokenAtCursor,
  findKeyframesByName,
  findSassSymbolAtCursor,
  findSassSymbolDeclByName,
  findValueImportAtCursor,
  findValueRefAtCursor,
  resolveComposesTarget,
  resolveValueImportTarget,
  resolveValueTarget,
} from "../../engine-core-ts/src/core/query";
import type { CursorParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export interface StyleDefinitionTarget {
  readonly originRange: Range;
  readonly targetFilePath: string;
  readonly targetRange: Range;
  readonly targetSelectionRange: Range;
}

export function resolveStyleDefinitionTargets(
  params: Pick<CursorParams, "filePath" | "line" | "character">,
  deps: Pick<ProviderDeps, "styleDocumentForPath">,
): readonly StyleDefinitionTarget[] {
  const styleDocument = deps.styleDocumentForPath(params.filePath);
  if (!styleDocument) return [];

  const composesHit = findComposesTokenAtCursor(styleDocument, params.line, params.character);
  const composesTarget = resolveComposesTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    composesHit,
  );
  if (composesHit && composesTarget) {
    return [
      toStyleDefinitionTarget(
        composesHit.token.range,
        composesTarget.filePath,
        findCanonicalSelector(composesTarget.styleDocument, composesTarget.selector),
      ),
    ];
  }

  const animationRef = findAnimationNameRefAtCursor(styleDocument, params.line, params.character);
  if (animationRef) {
    const keyframes = findKeyframesByName(styleDocument, animationRef.name);
    return keyframes
      ? [toStyleDefinitionTarget(animationRef.range, styleDocument.filePath, keyframes)]
      : [];
  }

  const valueImport = findValueImportAtCursor(styleDocument, params.line, params.character);
  if (valueImport) {
    const valueTarget = resolveValueImportTarget(
      deps.styleDocumentForPath,
      styleDocument.filePath,
      valueImport,
    );
    return valueTarget
      ? [toStyleDefinitionTarget(valueImport.range, valueTarget.filePath, valueTarget.valueDecl)]
      : [];
  }

  const sassSymbol = findSassSymbolAtCursor(styleDocument, params.line, params.character);
  if (sassSymbol) {
    const target = findSassSymbolDeclByName(styleDocument, sassSymbol.symbolKind, sassSymbol.name);
    return target
      ? [toStyleDefinitionTarget(sassSymbol.range, styleDocument.filePath, target)]
      : [];
  }

  const valueRef = findValueRefAtCursor(styleDocument, params.line, params.character);
  if (!valueRef) return [];
  const valueTarget = resolveValueTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    styleDocument,
    valueRef.name,
  );
  return valueTarget
    ? [toStyleDefinitionTarget(valueRef.range, valueTarget.filePath, valueTarget.valueDecl)]
    : [];
}

function toStyleDefinitionTarget(
  originRange: Range,
  targetFilePath: string,
  target: { readonly ruleRange: Range; readonly range: Range },
): StyleDefinitionTarget {
  return {
    originRange,
    targetFilePath,
    targetRange: target.ruleRange,
    targetSelectionRange: target.range,
  };
}
