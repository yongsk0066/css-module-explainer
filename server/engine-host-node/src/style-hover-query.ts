import type { Range } from "@css-module-explainer/shared";
import {
  findCanonicalSelector,
  findComposesTokenAtCursor,
  findSelectorAtCursor,
  readSelectorStyleDependencySummary,
  readSelectorUsageSummary,
  resolveComposesTarget,
} from "../../engine-core-ts/src/core/query";
import type { SelectorDeclHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { resolveSelectedQueryBackendKind } from "./selected-query-backend";
import {
  buildSelectorUsageRenderSummaryFromRustPayload,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
  type SelectorUsageRenderSummary,
} from "./selector-usage-query-backend";

export interface StyleSelectorHoverResult {
  readonly selector: SelectorDeclHIR;
  readonly range: Range;
  readonly scssModulePath: string;
  readonly usageSummary: SelectorUsageRenderSummary;
  readonly styleDependencies: ReturnType<typeof readSelectorStyleDependencySummary>;
  readonly headingName?: string;
  readonly note?: string;
}

export interface StyleHoverQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export function resolveStyleSelectorHoverResult(
  args: {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
  },
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "workspaceRoot"
    | "settings"
  >,
  options: StyleHoverQueryOptions = {},
): StyleSelectorHoverResult | null {
  const styleDocument = deps.styleDocumentForPath(args.filePath);
  if (!styleDocument) return null;

  const selector = findSelectorAtCursor(styleDocument, args.line, args.character);
  if (selector) {
    const canonicalSelector = findCanonicalSelector(styleDocument, selector);
    return {
      selector: canonicalSelector,
      range: selector.bemSuffix?.rawTokenRange ?? selector.range,
      scssModulePath: args.filePath,
      usageSummary: resolveStyleSelectorUsageSummary(
        deps,
        args.filePath,
        canonicalSelector.canonicalName,
        options,
      ),
      styleDependencies: readSelectorStyleDependencySummary(
        deps.styleDependencyGraph,
        args.filePath,
        canonicalSelector.canonicalName,
      ),
    };
  }

  const composesHit = findComposesTokenAtCursor(styleDocument, args.line, args.character);
  const target = resolveComposesTarget(
    deps.styleDocumentForPath,
    styleDocument.filePath,
    composesHit,
  );
  if (!composesHit || !target) return null;

  return {
    selector: target.selector,
    range: composesHit.token.range,
    scssModulePath: target.filePath,
    usageSummary: resolveStyleSelectorUsageSummary(
      deps,
      target.filePath,
      target.selector.canonicalName,
      options,
    ),
    styleDependencies: readSelectorStyleDependencySummary(
      deps.styleDependencyGraph,
      target.filePath,
      target.selector.canonicalName,
    ),
    headingName: composesHit.token.className,
    note: `Referenced via \`composes\` from \`.${composesHit.selector.name}\``,
  };
}

function resolveStyleSelectorUsageSummary(
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "styleDocumentForPath"
    | "typeResolver"
    | "semanticReferenceIndex"
    | "styleDependencyGraph"
    | "workspaceRoot"
    | "settings"
  >,
  filePath: string,
  canonicalName: string,
  options: StyleHoverQueryOptions,
): SelectorUsageRenderSummary {
  const backend = resolveSelectedQueryBackendKind(options.env);
  if (backend === "rust-selector-usage") {
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
    if (payload) {
      return buildSelectorUsageRenderSummaryFromRustPayload(payload);
    }
  }

  const usage = readSelectorUsageSummary(
    {
      semanticReferenceIndex: deps.semanticReferenceIndex,
      styleDependencyGraph: deps.styleDependencyGraph,
      styleDocumentForPath: deps.styleDocumentForPath,
    },
    filePath,
    canonicalName,
  );
  return usage;
}
