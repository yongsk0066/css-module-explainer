import type { Hover } from "vscode-languageserver/node";
import {
  findAnimationNameRefAtCursor,
  findCanonicalSelector,
  findComposesTokenAtCursor,
  findKeyframesAtCursor,
  findKeyframesByName,
  listAnimationNameRefs,
  findValueDeclAtCursor,
  findValueImportAtCursor,
  findValueRefAtCursor,
  listValueRefs,
  findSelectorAtCursor,
  readSelectorStyleDependencySummary,
  readSelectorUsageSummary,
  resolveComposesTarget,
  resolveValueImportTarget,
  resolveValueTarget,
} from "../../../engine-core-ts/src/core/query";
import { resolveSourceExpressionHoverResult } from "../../../engine-host-node/src/source-hover-query";
import { findLangForPath } from "../../../engine-core-ts/src/core/scss/lang-registry";
import { toLspRange } from "./lsp-adapters";
import {
  renderHover,
  renderKeyframesHover,
  renderSelectorHover,
  renderValueHover,
} from "./hover-renderer";
import { wrapHandler } from "./_wrap-handler";
import { withSourceExpressionAtCursor, type SourceExpressionContext } from "./cursor-dispatch";
import type { CursorParams, ProviderDeps } from "./provider-deps";

/**
 * Handle `textDocument/hover` for any class expression under the cursor.
 *
 * Dispatches through the unified expression cursor stage.
 * Source-side semantic resolution runs through the Node host boundary so
 * hover, definition, and rename logic can move off direct core query calls
 * incrementally. The resulting selector list is handed to the pure
 * `renderHover` markdown builder. An empty match yields a `null`
 * Hover; an exception is logged by `wrapHandler` and also returns
 * `null`.
 */
export const handleHover = wrapHandler<CursorParams, [maxCandidates?: number], Hover | null>(
  "hover",
  (params, deps, maxCandidates = 10) => {
    if (findLangForPath(params.filePath)) {
      return buildStyleHover(params, deps);
    }
    return withSourceExpressionAtCursor(params, deps, (ctx) =>
      buildHover(ctx, params, deps, maxCandidates),
    );
  },
  null,
);

function buildHover(
  ctx: SourceExpressionContext,
  params: CursorParams,
  deps: ProviderDeps,
  maxCandidates: number,
): Hover | null {
  const result = resolveSourceExpressionHoverResult(ctx, params.filePath, deps);
  const markdown = renderHover({
    expression: ctx.expression,
    scssModulePath: ctx.expression.scssModulePath,
    selectors: result.selectors,
    dynamicExplanation: result.dynamicExplanation,
    styleDependenciesBySelector: result.styleDependenciesBySelector,
    workspaceRoot: deps.workspaceRoot,
    maxCandidates,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.expression.range),
    contents: { kind: "markdown", value: markdown },
  };
}

function buildStyleHover(params: CursorParams, deps: ProviderDeps): Hover | null {
  const styleDocument = deps.styleDocumentForPath(params.filePath);
  if (!styleDocument) return null;

  const hit = findSelectorAtCursor(styleDocument, params.line, params.character);
  if (hit) {
    const selector = findCanonicalSelector(styleDocument, hit);
    const usageSummary = readSelectorUsageSummary(
      {
        semanticReferenceIndex: deps.semanticReferenceIndex,
        styleDependencyGraph: deps.styleDependencyGraph,
        styleDocumentForPath: deps.styleDocumentForPath,
      },
      params.filePath,
      selector.canonicalName,
    );
    const styleDependencies = readSelectorStyleDependencySummary(
      deps.styleDependencyGraph,
      params.filePath,
      selector.canonicalName,
    );
    const markdown = renderSelectorHover({
      selector,
      scssModulePath: params.filePath,
      usageSummary,
      styleDependencies,
      workspaceRoot: deps.workspaceRoot,
    });

    return {
      range: toLspRange(hit.bemSuffix?.rawTokenRange ?? hit.range),
      contents: { kind: "markdown", value: markdown },
    };
  }

  const composesHit = findComposesTokenAtCursor(styleDocument, params.line, params.character);
  const target = resolveComposesTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    composesHit,
  );
  if (composesHit && target) {
    const usageSummary = readSelectorUsageSummary(
      {
        semanticReferenceIndex: deps.semanticReferenceIndex,
        styleDependencyGraph: deps.styleDependencyGraph,
        styleDocumentForPath: deps.styleDocumentForPath,
      },
      target.filePath,
      target.selector.canonicalName,
    );
    const styleDependencies = readSelectorStyleDependencySummary(
      deps.styleDependencyGraph,
      target.filePath,
      target.selector.canonicalName,
    );
    const markdown = renderSelectorHover({
      selector: target.selector,
      headingName: composesHit.token.className,
      note: `Referenced via \`composes\` from \`.${composesHit.selector.name}\``,
      scssModulePath: target.filePath,
      usageSummary,
      styleDependencies,
      workspaceRoot: deps.workspaceRoot,
    });

    return {
      range: toLspRange(composesHit.token.range),
      contents: { kind: "markdown", value: markdown },
    };
  }

  const keyframes = findKeyframesAtCursor(styleDocument, params.line, params.character);
  if (keyframes) {
    const markdown = renderKeyframesHover({
      keyframes,
      scssModulePath: params.filePath,
      referenceCount: listAnimationNameRefs(styleDocument, keyframes.name).length,
      workspaceRoot: deps.workspaceRoot,
    });
    return {
      range: toLspRange(keyframes.range),
      contents: { kind: "markdown", value: markdown },
    };
  }

  const valueDecl = findValueDeclAtCursor(styleDocument, params.line, params.character);
  if (valueDecl) {
    const markdown = renderValueHover({
      valueDecl,
      scssModulePath: params.filePath,
      referenceCount: listValueRefs(styleDocument, valueDecl.name).length,
      workspaceRoot: deps.workspaceRoot,
    });
    return {
      range: toLspRange(valueDecl.range),
      contents: { kind: "markdown", value: markdown },
    };
  }

  const valueImport = findValueImportAtCursor(styleDocument, params.line, params.character);
  if (valueImport) {
    const targetValue = resolveValueImportTarget(
      deps.styleDocumentForPath,
      styleDocument.filePath,
      valueImport,
    );
    if (!targetValue) return null;
    const markdown = renderValueHover({
      valueDecl: targetValue.valueDecl,
      headingName: valueImport.name,
      note: `Imported from \`${valueImport.from}\` as \`${valueImport.importedName}\``,
      scssModulePath: targetValue.filePath,
      referenceCount: listValueRefs(styleDocument, valueImport.name).length,
      workspaceRoot: deps.workspaceRoot,
    });
    return {
      range: toLspRange(valueImport.range),
      contents: { kind: "markdown", value: markdown },
    };
  }

  const animationRef = findAnimationNameRefAtCursor(styleDocument, params.line, params.character);
  if (animationRef) {
    const targetKeyframes = findKeyframesByName(styleDocument, animationRef.name);
    if (!targetKeyframes) return null;

    const markdown = renderKeyframesHover({
      keyframes: targetKeyframes,
      headingName: animationRef.name,
      note: `Referenced via \`${animationRef.property}\``,
      scssModulePath: params.filePath,
      referenceCount: listAnimationNameRefs(styleDocument, targetKeyframes.name).length,
      workspaceRoot: deps.workspaceRoot,
    });
    return {
      range: toLspRange(animationRef.range),
      contents: { kind: "markdown", value: markdown },
    };
  }

  const valueRef = findValueRefAtCursor(styleDocument, params.line, params.character);
  if (!valueRef) return null;
  const targetValue = resolveValueTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    styleDocument,
    valueRef.name,
  );
  if (!targetValue) return null;

  const markdown = renderValueHover({
    valueDecl: targetValue.valueDecl,
    headingName: valueRef.name,
    note:
      targetValue.bindingKind === "imported"
        ? `Referenced via \`${valueRef.source === "declaration" ? "declaration value" : "@value"}\`; imported from \`${targetValue.valueImport!.from}\` as \`${targetValue.valueImport!.importedName}\``
        : `Referenced via \`${valueRef.source === "declaration" ? "declaration value" : "@value"}\``,
    scssModulePath: targetValue.filePath,
    referenceCount: listValueRefs(styleDocument, valueRef.name).length,
    workspaceRoot: deps.workspaceRoot,
  });
  return {
    range: toLspRange(valueRef.range),
    contents: { kind: "markdown", value: markdown },
  };
}
