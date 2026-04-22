import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildEngineInputV2 } from "./engine-input-v2";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const RUST_MANIFEST = path.join(REPO_ROOT, "rust/Cargo.toml");

export type SelectedQueryBackendKind = "typescript-current" | "rust-source-resolution";

export interface SourceResolutionBackendDocument {
  readonly uri: string;
  readonly content: string;
  readonly filePath: string;
  readonly version: number;
}

export interface SourceResolutionSelectorMatch {
  readonly styleFilePath: string;
  readonly selectorNames: readonly string[];
}

interface SourceResolutionEvaluatorCandidateV0 {
  readonly kind: "source-expression-resolution";
  readonly filePath: string;
  readonly queryId: string;
  readonly payload: {
    readonly expressionId: string;
    readonly styleFilePath: string;
    readonly selectorNames: readonly string[];
  };
}

interface SourceResolutionCanonicalProducerSignalV0 {
  readonly evaluatorCandidates: {
    readonly results: readonly SourceResolutionEvaluatorCandidateV0[];
  };
}

export function resolveSelectedQueryBackendKind(
  env: NodeJS.ProcessEnv = process.env,
): SelectedQueryBackendKind {
  const value = env.CME_SELECTED_QUERY_BACKEND?.trim() ?? "typescript-current";
  if (value === "typescript-current" || value === "rust-source-resolution") {
    return value;
  }

  throw new Error(`Unknown selected query backend: ${value}`);
}

export function resolveRustSourceResolutionSelectorMatch(
  document: SourceResolutionBackendDocument,
  expressionId: string,
  scssModulePath: string,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
): SourceResolutionSelectorMatch | null {
  const input = buildEngineInputV2({
    workspaceRoot: deps.workspaceRoot,
    classnameTransform: deps.settings.scss.classnameTransform,
    pathAlias: deps.settings.pathAlias,
    sourceDocuments: [document],
    styleFiles: [scssModulePath],
    analysisCache: deps.analysisCache,
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
  });

  const child = spawnSync(
    "cargo",
    [
      "run",
      "--manifest-path",
      RUST_MANIFEST,
      "-p",
      "engine-shadow-runner",
      "--quiet",
      "--",
      "input-source-resolution-canonical-producer",
    ],
    {
      cwd: REPO_ROOT,
      input: JSON.stringify(input),
      encoding: "utf8",
    },
  );

  if (child.status !== 0) {
    throw new Error(
      [`engine-shadow-runner exited with code ${child.status ?? "unknown"}`, child.stderr?.trim()]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const signal = JSON.parse(child.stdout) as SourceResolutionCanonicalProducerSignalV0;
  const match = signal.evaluatorCandidates.results.find(
    (candidate) => candidate.queryId === expressionId,
  );
  if (!match || !match.payload.styleFilePath) return null;

  return {
    styleFilePath: match.payload.styleFilePath,
    selectorNames: match.payload.selectorNames,
  };
}
