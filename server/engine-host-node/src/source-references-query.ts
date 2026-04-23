import type { Range } from "@css-module-explainer/shared";
import {
  findCanonicalSelector,
  readSourceExpressionResolution,
  type SourceExpressionContext,
} from "../../engine-core-ts/src/core/query";
import type {
  SelectorDeclHIR,
  StyleDocumentHIR,
} from "../../engine-core-ts/src/core/hir/style-types";
import type { CursorParams, ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { pathToFileUrl } from "../../engine-core-ts/src/core/util/text-utils";
import {
  resolveRustSourceResolutionSelectorMatch,
  usesRustSelectorUsageBackend,
  usesRustSourceResolutionBackend,
} from "./source-resolution-query-backend";
import {
  buildSelectorUsageLocationsFromRustPayload,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
} from "./selector-usage-query-backend";
import { resolveSelectedQueryBackendKind } from "./selected-query-backend";
import { resolveSelectorReferenceLocations } from "./selector-references-query";

export interface SourceReferenceLocation {
  readonly uri: string;
  readonly range: Range;
}

interface SourceReferenceTarget {
  readonly filePath: string;
  readonly canonicalName: string;
}

export interface SourceReferencesQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSourceResolutionSelectorMatch?: typeof resolveRustSourceResolutionSelectorMatch;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export function resolveSourceExpressionReferences(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "semanticReferenceIndex"
    | "settings"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: SourceReferencesQueryOptions = {},
): readonly SourceReferenceLocation[] {
  const targets = resolveSourceReferenceTargets(ctx, params, deps, options);
  if (targets.length === 0) return [];

  const locations = targets.flatMap((target) =>
    resolveReferenceLocationsForTarget(target, deps, options),
  );
  return dedupeLocations(locations);
}

function resolveSourceReferenceTargets(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  options: SourceReferencesQueryOptions,
): readonly SourceReferenceTarget[] {
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  if (usesRustSourceResolutionBackend(selectedQueryBackend)) {
    const rustTargets = resolveReferenceTargetsFromRust(
      ctx,
      params,
      deps,
      options.readRustSourceResolutionSelectorMatch ?? resolveRustSourceResolutionSelectorMatch,
    );
    if (rustTargets.length > 0) return rustTargets;
  }

  const resolution = readSourceExpressionResolution(
    {
      expression: ctx.expression,
      sourceFile: ctx.entry.sourceFile,
      styleDocument: ctx.styleDocument,
    },
    {
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      filePath: params.filePath,
      workspaceRoot: deps.workspaceRoot,
      sourceBinder: ctx.entry.sourceBinder,
      sourceBindingGraph: ctx.entry.sourceBindingGraph,
    },
  );
  if (!resolution.styleDocument || resolution.selectors.length === 0) return [];
  return dedupeTargets(
    resolution.selectors.map((selector) =>
      toSourceReferenceTarget(
        resolution.styleDocument!,
        resolution.styleDocument!.filePath,
        selector,
      ),
    ),
  );
}

function resolveReferenceTargetsFromRust(
  ctx: SourceExpressionContext,
  params: Pick<CursorParams, "documentUri" | "content" | "filePath" | "version">,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
  readRustSelectorMatch: typeof resolveRustSourceResolutionSelectorMatch,
): readonly SourceReferenceTarget[] {
  const match = readRustSelectorMatch(
    {
      uri: params.documentUri,
      content: params.content,
      filePath: params.filePath,
      version: params.version,
    },
    ctx.expression.id,
    ctx.expression.scssModulePath,
    deps,
  );
  if (!match || match.selectorNames.length === 0) return [];

  const styleDocument = deps.styleDocumentForPath(match.styleFilePath);
  if (!styleDocument) return [];

  return dedupeTargets(
    match.selectorNames
      .map((name) => {
        const selector =
          styleDocument.selectors.find((candidate) => candidate.canonicalName === name) ?? null;
        return selector
          ? toSourceReferenceTarget(styleDocument, match.styleFilePath, selector)
          : null;
      })
      .filter((target): target is SourceReferenceTarget => target !== null),
  );
}

function toSourceReferenceTarget(
  styleDocument: StyleDocumentHIR,
  styleFilePath: string,
  selector: SelectorDeclHIR,
): SourceReferenceTarget {
  return {
    filePath: styleFilePath,
    canonicalName: findCanonicalSelector(styleDocument, selector).canonicalName,
  };
}

function resolveReferenceLocationsForTarget(
  target: SourceReferenceTarget,
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "semanticReferenceIndex"
    | "settings"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: SourceReferencesQueryOptions,
): readonly SourceReferenceLocation[] {
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  if (usesRustSelectorUsageBackend(selectedQueryBackend)) {
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
      target.filePath,
      target.canonicalName,
    );
    const rustLocations =
      payload &&
      buildSelectorUsageLocationsFromRustPayload(payload)?.map((site) => ({
        uri: pathToFileUrl(site.filePath),
        range: site.range,
      }));
    if (rustLocations) return rustLocations;
  }

  return resolveSelectorReferenceLocations(deps, target);
}

function dedupeTargets(
  targets: readonly SourceReferenceTarget[],
): readonly SourceReferenceTarget[] {
  const unique = new Map<string, SourceReferenceTarget>();
  for (const target of targets) {
    const key = `${target.filePath}:${target.canonicalName}`;
    if (!unique.has(key)) unique.set(key, target);
  }
  return [...unique.values()];
}

function dedupeLocations(
  locations: readonly SourceReferenceLocation[],
): readonly SourceReferenceLocation[] {
  const unique = new Map<string, SourceReferenceLocation>();
  for (const location of locations) {
    const key = [
      location.uri,
      location.range.start.line,
      location.range.start.character,
      location.range.end.line,
      location.range.end.character,
    ].join(":");
    if (!unique.has(key)) unique.set(key, location);
  }
  return [...unique.values()];
}
