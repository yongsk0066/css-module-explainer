import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildEngineInputV2 } from "./engine-input-v2";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const RUST_MANIFEST = path.join(REPO_ROOT, "rust/Cargo.toml");

export type SelectedQueryBackendKind =
  | "typescript-current"
  | "rust-source-resolution"
  | "rust-expression-semantics"
  | "rust-selector-usage";

export interface SelectedQueryBackendDocument {
  readonly uri: string;
  readonly content: string;
  readonly filePath: string;
  readonly version: number;
}

export function resolveSelectedQueryBackendKind(
  env: NodeJS.ProcessEnv = process.env,
): SelectedQueryBackendKind {
  const value = env.CME_SELECTED_QUERY_BACKEND?.trim() ?? "typescript-current";
  if (
    value === "typescript-current" ||
    value === "rust-source-resolution" ||
    value === "rust-expression-semantics" ||
    value === "rust-selector-usage"
  ) {
    return value;
  }

  throw new Error(`Unknown selected query backend: ${value}`);
}

export function buildSelectedQueryBackendInput(
  document: SelectedQueryBackendDocument,
  scssModulePath: string,
  deps: Pick<
    ProviderDeps,
    "analysisCache" | "styleDocumentForPath" | "typeResolver" | "workspaceRoot" | "settings"
  >,
) {
  return buildEngineInputV2({
    workspaceRoot: deps.workspaceRoot,
    classnameTransform: deps.settings.scss.classnameTransform,
    pathAlias: deps.settings.pathAlias,
    sourceDocuments: [document],
    styleFiles: [scssModulePath],
    analysisCache: deps.analysisCache,
    styleDocumentForPath: deps.styleDocumentForPath,
    typeResolver: deps.typeResolver,
  });
}

export function runRustSelectedQueryBackendJson<T>(command: string, input: unknown): T {
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
      command,
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

  return JSON.parse(child.stdout) as T;
}
