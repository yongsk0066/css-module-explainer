import type { EngineInputV2 } from "../../engine-core-ts/src/contracts";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { buildEngineInputV2 } from "./engine-input-v2";
import {
  collectSourceDocuments,
  resolveWorkspaceCheckFilesSync,
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
  readonly selectorIdentityEngine: unknown;
  readonly sourceInputEvidence: unknown;
  readonly promotionEvidence: unknown;
  readonly losslessCstContract: unknown;
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
  const { sourceFiles, styleFiles } = resolveWorkspaceCheckFilesSync({
    workspaceRoot: args.workspaceRoot,
  });
  const sourceDocuments = collectSourceDocuments(sourceFiles, deps.analysisCache);

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

function ensureStyleFileIncluded(
  styleFiles: readonly string[],
  stylePath: string,
): readonly string[] {
  return styleFiles.includes(stylePath) ? styleFiles : [...styleFiles, stylePath];
}
