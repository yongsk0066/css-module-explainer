import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildEngineInputV2 } from "./engine-input-v2";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const RUST_MANIFEST = path.join(REPO_ROOT, "rust/Cargo.toml");
const ENGINE_SHADOW_RUNNER_BINARY =
  process.platform === "win32" ? "engine-shadow-runner.exe" : "engine-shadow-runner";

export type SelectedQueryBackendKind =
  | "typescript-current"
  | "rust-selected-query"
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
    value === "rust-selected-query" ||
    value === "rust-source-resolution" ||
    value === "rust-expression-semantics" ||
    value === "rust-selector-usage"
  ) {
    return value;
  }

  throw new Error(`Unknown selected query backend: ${value}`);
}

export function usesRustSourceResolutionBackend(kind: SelectedQueryBackendKind): boolean {
  return kind === "rust-source-resolution" || kind === "rust-selected-query";
}

export function usesRustExpressionSemanticsBackend(kind: SelectedQueryBackendKind): boolean {
  return kind === "rust-expression-semantics" || kind === "rust-selected-query";
}

export function usesRustSelectorUsageBackend(kind: SelectedQueryBackendKind): boolean {
  return kind === "rust-selector-usage" || kind === "rust-selected-query";
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

export interface EngineShadowRunnerInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export function resolveEngineShadowRunnerBinaryPath(env: NodeJS.ProcessEnv = process.env): string {
  const targetDir = env.CARGO_TARGET_DIR
    ? path.resolve(REPO_ROOT, env.CARGO_TARGET_DIR)
    : path.join(REPO_ROOT, "rust/target");
  return path.join(targetDir, "debug", ENGINE_SHADOW_RUNNER_BINARY);
}

export function buildEngineShadowRunnerInvocation(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
): EngineShadowRunnerInvocation {
  if (env.CME_ENGINE_SHADOW_RUNNER === "prebuilt") {
    const runnerPath = resolveEngineShadowRunnerBinaryPath(env);
    if (!fileExists(runnerPath)) {
      throw new Error(
        `CME_ENGINE_SHADOW_RUNNER=prebuilt requires ${runnerPath}; run pnpm check:rust-selected-query-warmup first`,
      );
    }
    return {
      command: runnerPath,
      args: [command],
      cwd: REPO_ROOT,
    };
  }

  return {
    command: "cargo",
    args: [
      "run",
      "--manifest-path",
      RUST_MANIFEST,
      "-p",
      "engine-shadow-runner",
      "--quiet",
      "--",
      command,
    ],
    cwd: REPO_ROOT,
  };
}

export function runRustSelectedQueryBackendJson<T>(command: string, input: unknown): T {
  const invocation = buildEngineShadowRunnerInvocation(command);
  const child = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
  });

  if (child.status !== 0) {
    throw new Error(
      [`engine-shadow-runner exited with code ${child.status ?? "unknown"}`, child.stderr?.trim()]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return JSON.parse(child.stdout) as T;
}
