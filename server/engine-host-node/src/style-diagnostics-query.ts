import {
  checkStyleDocument,
  type StyleCheckerFinding,
} from "../../engine-core-ts/src/core/checker";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import {
  resolveSelectedQueryBackendKind,
  usesRustSelectorUsageBackend,
} from "./selected-query-backend";
import {
  resolveUnusedStyleSelectors,
  type StyleModuleUsageQueryOptions,
} from "./style-module-usage-query";

export interface StyleDiagnosticsQueryOptions extends StyleModuleUsageQueryOptions {}

export function resolveStyleDiagnosticFindings(
  args: {
    readonly scssPath: string;
    readonly styleDocument: StyleDocumentHIR;
  },
  deps: Pick<ProviderDeps, "semanticReferenceIndex"> & {
    readonly analysisCache?: ProviderDeps["analysisCache"];
    readonly styleDependencyGraph?: ProviderDeps["styleDependencyGraph"];
    readonly styleDocumentForPath?: ProviderDeps["styleDocumentForPath"];
    readonly typeResolver?: ProviderDeps["typeResolver"];
    readonly workspaceRoot?: ProviderDeps["workspaceRoot"];
    readonly settings?: ProviderDeps["settings"];
    readonly aliasResolver?: ProviderDeps["aliasResolver"];
  },
  options: StyleDiagnosticsQueryOptions = {},
): readonly StyleCheckerFinding[] {
  const selectedQueryBackend = resolveSelectedQueryBackendKind(options.env);
  const useRustSelectorUsage = usesRustSelectorUsageBackend(selectedQueryBackend);
  if (useRustSelectorUsage && hasRustStyleDiagnosticsDeps(deps)) {
    const rustDeps = {
      analysisCache: deps.analysisCache,
      semanticReferenceIndex: deps.semanticReferenceIndex,
      styleDependencyGraph: deps.styleDependencyGraph,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      workspaceRoot: deps.workspaceRoot,
      settings: deps.settings,
      ...(deps.aliasResolver ? { aliasResolver: deps.aliasResolver } : {}),
    } satisfies Pick<
      ProviderDeps,
      | "analysisCache"
      | "semanticReferenceIndex"
      | "styleDependencyGraph"
      | "styleDocumentForPath"
      | "typeResolver"
      | "workspaceRoot"
      | "settings"
    > & { readonly aliasResolver?: ProviderDeps["aliasResolver"] };
    const unusedSelectors = resolveUnusedStyleSelectors(args, rustDeps, options);
    const otherFindings = checkStyleDocument(
      args,
      {
        semanticReferenceIndex: rustDeps.semanticReferenceIndex,
        styleDependencyGraph: rustDeps.styleDependencyGraph,
        styleDocumentForPath: rustDeps.styleDocumentForPath,
        ...(rustDeps.aliasResolver ? { aliasResolver: rustDeps.aliasResolver } : {}),
      },
      { includeUnusedSelectors: false },
    );
    return [
      ...unusedSelectors.map<StyleCheckerFinding>((selector) => ({
        category: "style",
        code: "unused-selector",
        severity: "hint",
        range: selector.range,
        selectorFilePath: args.scssPath,
        canonicalName: selector.canonicalName,
      })),
      ...otherFindings,
    ];
  }

  return checkCurrentStyleDocument(args, deps, { includeUnusedSelectors: !useRustSelectorUsage });
}

function hasRustStyleDiagnosticsDeps(
  deps: Pick<ProviderDeps, "semanticReferenceIndex"> & {
    readonly analysisCache?: ProviderDeps["analysisCache"];
    readonly styleDependencyGraph?: ProviderDeps["styleDependencyGraph"];
    readonly styleDocumentForPath?: ProviderDeps["styleDocumentForPath"];
    readonly typeResolver?: ProviderDeps["typeResolver"];
    readonly workspaceRoot?: ProviderDeps["workspaceRoot"];
    readonly settings?: ProviderDeps["settings"];
    readonly aliasResolver?: ProviderDeps["aliasResolver"];
  },
): deps is Pick<
  ProviderDeps,
  | "analysisCache"
  | "semanticReferenceIndex"
  | "styleDependencyGraph"
  | "styleDocumentForPath"
  | "typeResolver"
  | "workspaceRoot"
  | "settings"
> & { readonly aliasResolver?: ProviderDeps["aliasResolver"] } {
  return Boolean(
    deps.analysisCache &&
    deps.styleDependencyGraph &&
    deps.styleDocumentForPath &&
    deps.typeResolver &&
    deps.workspaceRoot &&
    deps.settings,
  );
}

function checkCurrentStyleDocument(
  args: {
    readonly scssPath: string;
    readonly styleDocument: StyleDocumentHIR;
  },
  deps: Pick<ProviderDeps, "semanticReferenceIndex"> & {
    readonly styleDependencyGraph?: ProviderDeps["styleDependencyGraph"];
    readonly styleDocumentForPath?: ProviderDeps["styleDocumentForPath"];
    readonly aliasResolver?: ProviderDeps["aliasResolver"];
  },
  options: { readonly includeUnusedSelectors: boolean },
): readonly StyleCheckerFinding[] {
  return checkStyleDocument(
    args,
    {
      semanticReferenceIndex: deps.semanticReferenceIndex,
      ...(deps.styleDependencyGraph ? { styleDependencyGraph: deps.styleDependencyGraph } : {}),
      ...(deps.styleDocumentForPath ? { styleDocumentForPath: deps.styleDocumentForPath } : {}),
      ...(deps.aliasResolver ? { aliasResolver: deps.aliasResolver } : {}),
    },
    options,
  );
}
