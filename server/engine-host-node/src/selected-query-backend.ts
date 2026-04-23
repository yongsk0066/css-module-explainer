import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildEngineInputV2 } from "./engine-input-v2";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const BUNDLED_EXTENSION_ROOT = path.resolve(__dirname, "../..");
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
  fileExists: (filePath: string) => boolean = existsSync,
): SelectedQueryBackendKind {
  const value = env.CME_SELECTED_QUERY_BACKEND?.trim();
  if (value === "auto") {
    return canUsePrebuiltEngineShadowRunner(env, fileExists)
      ? "rust-selected-query"
      : "typescript-current";
  }
  if (!value) {
    return canUsePrebuiltEngineShadowRunner(env, fileExists) &&
      isPackagedExtensionRuntime(env, fileExists)
      ? "rust-selected-query"
      : "typescript-current";
  }

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

function resolveProjectRoot(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
): string {
  if (env.CME_PROJECT_ROOT) return path.resolve(env.CME_PROJECT_ROOT);

  for (const candidate of [REPO_ROOT, BUNDLED_EXTENSION_ROOT, process.cwd()]) {
    if (fileExists(path.join(candidate, "package.json"))) return candidate;
  }

  return REPO_ROOT;
}

export function resolveEngineShadowRunnerBinaryPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveEngineShadowRunnerBinaryPathForEnv(env);
}

export function canUsePrebuiltEngineShadowRunner(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
): boolean {
  return fileExists(resolveEngineShadowRunnerBinaryPathForEnv(env, fileExists));
}

export function isPackagedExtensionRuntime(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
): boolean {
  const projectRoot = resolveProjectRoot(env, fileExists);
  const hasBundledEntrypoints =
    fileExists(path.join(projectRoot, "dist/client/extension.js")) &&
    fileExists(path.join(projectRoot, "dist/server/server.js"));
  const hasSourceCheckoutMarkers =
    fileExists(path.join(projectRoot, "server/engine-host-node/src/selected-query-backend.ts")) ||
    fileExists(path.join(projectRoot, "rust/Cargo.toml"));

  return hasBundledEntrypoints && !hasSourceCheckoutMarkers;
}

function resolveEngineShadowRunnerBinaryPathForEnv(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
): string {
  if (env.CME_ENGINE_SHADOW_RUNNER_PATH) {
    return path.resolve(env.CME_ENGINE_SHADOW_RUNNER_PATH);
  }

  const projectRoot = resolveProjectRoot(env, fileExists);
  const targetDir = env.CARGO_TARGET_DIR
    ? path.resolve(projectRoot, env.CARGO_TARGET_DIR)
    : path.join(projectRoot, "rust/target");
  const candidates = [
    path.join(
      projectRoot,
      "dist/bin",
      `${process.platform}-${process.arch}`,
      ENGINE_SHADOW_RUNNER_BINARY,
    ),
    path.join(projectRoot, "dist/bin", ENGINE_SHADOW_RUNNER_BINARY),
    path.join(targetDir, "debug", ENGINE_SHADOW_RUNNER_BINARY),
  ];

  return candidates.find(fileExists) ?? candidates[candidates.length - 1]!;
}

export function buildEngineShadowRunnerInvocation(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
): EngineShadowRunnerInvocation {
  const projectRoot = resolveProjectRoot(env, fileExists);
  const runnerMode = env.CME_ENGINE_SHADOW_RUNNER?.trim();
  const hasRunnerMode = env.CME_ENGINE_SHADOW_RUNNER !== undefined;
  if (
    runnerMode === "prebuilt" ||
    (!hasRunnerMode && canUsePrebuiltEngineShadowRunner(env, fileExists))
  ) {
    const runnerPath = resolveEngineShadowRunnerBinaryPathForEnv(env, fileExists);
    if (!fileExists(runnerPath)) {
      throw new Error(
        `CME_ENGINE_SHADOW_RUNNER=prebuilt requires ${runnerPath}; run pnpm check:rust-selected-query-warmup first`,
      );
    }
    return {
      command: runnerPath,
      args: [command],
      cwd: projectRoot,
    };
  }

  return {
    command: "cargo",
    args: [
      "run",
      "--manifest-path",
      path.join(projectRoot, "rust/Cargo.toml"),
      "-p",
      "engine-shadow-runner",
      "--quiet",
      "--",
      command,
    ],
    cwd: projectRoot,
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
