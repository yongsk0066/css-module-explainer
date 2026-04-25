import type { Range } from "@css-module-explainer/shared";
import type { EngineInputV2 } from "../../engine-core-ts/src/contracts";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { buildEngineInputV2 } from "./engine-input-v2";
import {
  collectSourceDocuments,
  resolveWorkspaceCheckFilesSync,
  type SourceDocumentSnapshot,
} from "./checker-host/workspace-check-support";
import { runRustSelectedQueryBackendJson } from "./selected-query-backend";
import type { BuildSelectedQueryResultsV2Options } from "./engine-query-v2";

type RustJsonRunner = <T>(command: string, input: unknown) => T;

export interface StyleSemanticGraphSummaryV0 {
  readonly schemaVersion: "0";
  readonly product: "omena-semantic.style-semantic-graph";
  readonly language: string;
  readonly parserFacts: unknown;
  readonly semanticFacts: unknown;
  readonly selectorIdentityEngine: StyleSemanticGraphSelectorIdentityEngineV0;
  readonly selectorReferenceEngine: StyleSemanticGraphSelectorReferenceEngineV0;
  readonly sourceInputEvidence: unknown;
  readonly promotionEvidence: unknown;
  readonly losslessCstContract: unknown;
}

export interface StyleSemanticGraphSelectorIdentityEngineV0 {
  readonly schemaVersion: "0";
  readonly product: "omena-semantic.selector-identity";
  readonly canonicalIdCount: number;
  readonly canonicalIds: readonly StyleSemanticGraphSelectorIdentityV0[];
  readonly rewriteSafety: {
    readonly allCanonicalIdsRewriteSafe: boolean;
    readonly safeCanonicalIds: readonly string[];
    readonly blockedCanonicalIds: readonly string[];
    readonly blockers: readonly string[];
  };
}

export interface StyleSemanticGraphSelectorIdentityV0 {
  readonly canonicalId: string;
  readonly localName: string;
  readonly identityKind: string;
  readonly rewriteSafety: "safe" | "blocked";
  readonly blockers: readonly string[];
}

export interface StyleSemanticGraphSelectorIdentityReadModel {
  readonly canonicalId: string;
  readonly canonicalName: string;
  readonly identityKind: string;
  readonly rewriteSafety: StyleSemanticGraphSelectorIdentityV0["rewriteSafety"];
  readonly blockers: readonly string[];
  readonly range: StyleDocumentHIR["selectors"][number]["range"];
  readonly ruleRange: StyleDocumentHIR["selectors"][number]["ruleRange"];
  readonly viewKind: StyleDocumentHIR["selectors"][number]["viewKind"];
}

export interface StyleSemanticGraphSelectorReferenceEngineV0 {
  readonly schemaVersion: "0";
  readonly product: "omena-semantic.selector-references";
  readonly stylePath: string | null;
  readonly selectorCount: number;
  readonly referencedSelectorCount: number;
  readonly unreferencedSelectorCount: number;
  readonly totalReferenceSites: number;
  readonly selectors: readonly StyleSemanticGraphSelectorReferenceSummaryV0[];
}

export interface StyleSemanticGraphSelectorReferenceSummaryV0 {
  readonly canonicalId: string;
  readonly filePath: string;
  readonly localName: string;
  readonly totalReferences: number;
  readonly directReferenceCount: number;
  readonly editableDirectReferenceCount: number;
  readonly exactReferenceCount: number;
  readonly inferredOrBetterReferenceCount: number;
  readonly hasExpandedReferences: boolean;
  readonly hasStyleDependencyReferences: boolean;
  readonly hasAnyReferences: boolean;
  readonly sites: readonly StyleSemanticGraphSelectorReferenceSiteV0[];
  readonly editableDirectSites: readonly StyleSemanticGraphSelectorEditableDirectSiteV0[];
}

export interface StyleSemanticGraphSelectorReferenceSiteV0 {
  readonly filePath: string;
  readonly range: Range;
  readonly expansion: string;
  readonly referenceKind: string;
}

export interface StyleSemanticGraphSelectorEditableDirectSiteV0 {
  readonly filePath: string;
  readonly range: Range;
  readonly className: string;
}

export interface StyleSemanticGraphRunnerInputV0 {
  readonly stylePath: string;
  readonly styleSource: string;
  readonly engineInput: EngineInputV2;
}

type StyleSemanticGraphQueryBackendOptions = Pick<
  BuildSelectedQueryResultsV2Options,
  | "workspaceRoot"
  | "classnameTransform"
  | "pathAlias"
  | "sourceDocuments"
  | "styleFiles"
  | "analysisCache"
  | "styleDocumentForPath"
  | "typeResolver"
> & {
  readonly readStyleFile: ProviderDeps["readStyleFile"];
};

export interface StyleSemanticGraphQueryOptions {
  readonly runRustSelectedQueryBackendJson?: RustJsonRunner;
  readonly sourceDocuments?: readonly SourceDocumentSnapshot[];
  readonly styleFiles?: readonly string[];
}

export function resolveRustStyleSemanticGraph(
  options: StyleSemanticGraphQueryBackendOptions,
  stylePath: string,
  queryOptions: StyleSemanticGraphQueryOptions = {},
): StyleSemanticGraphSummaryV0 | null {
  const styleSource = options.readStyleFile(stylePath);
  if (styleSource === null) return null;

  const engineInput = buildEngineInputV2({
    workspaceRoot: options.workspaceRoot,
    classnameTransform: options.classnameTransform,
    pathAlias: options.pathAlias,
    sourceDocuments: options.sourceDocuments,
    styleFiles: ensureStyleFileIncluded(options.styleFiles, stylePath),
    analysisCache: options.analysisCache,
    styleDocumentForPath: options.styleDocumentForPath,
    typeResolver: options.typeResolver,
  });

  return runRustStyleSemanticGraph(
    {
      stylePath,
      styleSource,
      engineInput,
    },
    queryOptions,
  );
}

export function resolveRustStyleSemanticGraphForWorkspaceTarget(
  args: {
    readonly workspaceRoot: string;
    readonly classnameTransform: BuildSelectedQueryResultsV2Options["classnameTransform"];
    readonly pathAlias: BuildSelectedQueryResultsV2Options["pathAlias"];
  },
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "readStyleFile"
  >,
  stylePath: string,
  queryOptions: StyleSemanticGraphQueryOptions = {},
): StyleSemanticGraphSummaryV0 | null {
  const resolvedFiles =
    queryOptions.sourceDocuments && queryOptions.styleFiles
      ? null
      : resolveWorkspaceCheckFilesSync({
          workspaceRoot: args.workspaceRoot,
        });
  const sourceDocuments =
    queryOptions.sourceDocuments ??
    collectSourceDocuments(resolvedFiles?.sourceFiles ?? [], deps.analysisCache);
  const styleFiles = queryOptions.styleFiles ?? resolvedFiles?.styleFiles ?? [];

  return resolveRustStyleSemanticGraph(
    {
      workspaceRoot: args.workspaceRoot,
      classnameTransform: args.classnameTransform,
      pathAlias: args.pathAlias,
      sourceDocuments,
      styleFiles,
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      readStyleFile: deps.readStyleFile,
    },
    stylePath,
    queryOptions,
  );
}

export function runRustStyleSemanticGraph(
  input: StyleSemanticGraphRunnerInputV0,
  options: StyleSemanticGraphQueryOptions = {},
): StyleSemanticGraphSummaryV0 {
  const runJson = options.runRustSelectedQueryBackendJson ?? runRustSelectedQueryBackendJson;
  return runJson<StyleSemanticGraphSummaryV0>("style-semantic-graph", input);
}

export function buildStyleSemanticGraphSelectorIdentityReadModels(
  graph: StyleSemanticGraphSummaryV0,
  styleDocument: StyleDocumentHIR,
): readonly StyleSemanticGraphSelectorIdentityReadModel[] {
  const selectorByCanonicalName = new Map(
    styleDocument.selectors.map((selector) => [selector.canonicalName, selector] as const),
  );

  return graph.selectorIdentityEngine.canonicalIds.flatMap((identity) => {
    const selector = selectorByCanonicalName.get(identity.localName);
    if (!selector) return [];

    return [
      {
        canonicalId: identity.canonicalId,
        canonicalName: identity.localName,
        identityKind: identity.identityKind,
        rewriteSafety: identity.rewriteSafety,
        blockers: identity.blockers,
        range: selector.range,
        ruleRange: selector.ruleRange,
        viewKind: selector.viewKind,
      },
    ];
  });
}

function ensureStyleFileIncluded(
  styleFiles: readonly string[],
  stylePath: string,
): readonly string[] {
  return styleFiles.includes(stylePath) ? styleFiles : [...styleFiles, stylePath];
}
