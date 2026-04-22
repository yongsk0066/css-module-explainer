import {
  planSelectorRename,
  type SelectorRenameReadResult,
  type SelectorRenameTarget,
} from "../../engine-core-ts/src/core/rewrite/selector-rename";
import { readStyleSelectorRewritePolicy } from "../../engine-core-ts/src/core/rewrite/read-style-rewrite-policy";
import {
  findSelectorAtCursor,
  readSelectorRewriteSafetySummary,
} from "../../engine-core-ts/src/core/query";
import type { SelectorReferenceRewritePolicy } from "../../engine-core-ts/src/core/query/read-selector-rewrite-safety";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { pathToFileUrl } from "../../engine-core-ts/src/core/util/text-utils";
import { resolveSelectedQueryBackendKind } from "./selected-query-backend";
import { resolveRustSelectorUsagePayloadForWorkspaceTarget } from "./selector-usage-query-backend";

export interface StyleRenameQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export function readStyleRenameTargetAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: StyleRenameQueryOptions = {},
): SelectorRenameReadResult {
  const selector = findSelectorAtCursor(styleDocument, line, character);
  if (!selector) return { kind: "miss" };

  const aliasMode = deps.settings.scss.classnameTransform;
  const rewritePolicy = readStyleSelectorRewritePolicy({
    styleDocument,
    selector,
    aliasMode,
    rejectAliasSelectorViews: true,
  });
  if (rewritePolicy.kind === "blocked") {
    return rewritePolicy;
  }

  const rewriteSafety = resolveStyleRenameRewriteSafety(
    filePath,
    rewritePolicy.summary.canonicalName,
    deps,
    options,
  );
  if (rewriteSafety.hasBlockingStyleDependencyReferences) {
    return { kind: "blocked", reason: "styleDependencyReferences" };
  }
  if (rewriteSafety.hasBlockingExpandedReferences) {
    return { kind: "blocked", reason: "expandedReferences" };
  }

  const target: SelectorRenameTarget = {
    scssPath: filePath,
    scssUri: pathToFileUrl(filePath),
    styleDocument,
    selector,
    styleRewritePolicy: rewritePolicy.summary,
    placeholder: selector.name,
    placeholderRange: selector.bemSuffix?.rawTokenRange ?? selector.range,
    rewriteSafety,
    aliasMode,
  };
  return {
    kind: "target",
    target,
  };
}

export function planStyleRenameAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  newName: string,
  options: StyleRenameQueryOptions = {},
) {
  const result = readStyleRenameTargetAtCursor(
    filePath,
    line,
    character,
    styleDocument,
    deps,
    options,
  );
  if (result.kind !== "target") return null;
  return planSelectorRename(result.target, newName);
}

function resolveStyleRenameRewriteSafety(
  filePath: string,
  canonicalName: string,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "settings"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: StyleRenameQueryOptions,
) {
  const base = readSelectorRewriteSafetySummary(deps, filePath, canonicalName);
  if (resolveSelectedQueryBackendKind(options.env) !== "rust-selector-usage") {
    return base;
  }

  const payload = (
    options.readRustSelectorUsagePayloadForWorkspaceTarget ??
    resolveRustSelectorUsagePayloadForWorkspaceTarget
  )(
    {
      workspaceRoot: deps.workspaceRoot,
      classnameTransform: deps.settings.scss.classnameTransform,
      pathAlias: deps.settings.pathAlias,
    },
    deps,
    filePath,
    canonicalName,
  );
  if (!payload) return base;

  const hasBlockingStyleDependencyReferences = payload.hasStyleDependencyReferences;
  const hasBlockingExpandedReferences = payload.hasExpandedReferences;
  const referenceRewritePolicy: SelectorReferenceRewritePolicy =
    hasBlockingStyleDependencyReferences
      ? "blockedByStyleDependencies"
      : hasBlockingExpandedReferences
        ? "blockedByExpandedReferences"
        : "directOnly";
  return {
    ...base,
    usage: {
      ...base.usage,
      totalReferences: payload.totalReferences,
      directReferenceCount: payload.directReferenceCount,
      hasExpandedReferences: payload.hasExpandedReferences,
      hasStyleDependencyReferences: payload.hasStyleDependencyReferences,
      hasAnyReferences: payload.hasAnyReferences,
    },
    referenceRewritePolicy,
    hasBlockingExpandedReferences,
    hasBlockingStyleDependencyReferences,
  };
}
