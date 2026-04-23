import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import ts from "typescript";
import type { Range, ResolvedType } from "@css-module-explainer/shared";
import { createDefaultProgram } from "../../engine-core-ts/src/core/ts/default-program";
import {
  WorkspaceTypeResolver,
  type ResolveTypeOptions,
  type TypeResolver,
} from "../../engine-core-ts/src/core/ts/type-resolver";

interface TsgoProbeResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

interface TsgoProbeState {
  readonly configPath: string | null;
  readonly ok: boolean;
}

export interface TsgoProbeTypeResolverOptions {
  readonly fallbackResolver?: TypeResolver;
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
  readonly findConfigFile?: (workspaceRoot: string) => string | null;
  readonly runProbeCommand?: (workspaceRoot: string, configPath: string) => TsgoProbeResult;
}

export class TsgoProbeTypeResolver implements TypeResolver {
  private readonly probeStateByWorkspace = new Map<string, TsgoProbeState>();
  private readonly fallbackResolver: TypeResolver;
  private readonly findConfigFile: (workspaceRoot: string) => string | null;
  private readonly runProbeCommand: (workspaceRoot: string, configPath: string) => TsgoProbeResult;

  constructor(options: TsgoProbeTypeResolverOptions = {}) {
    this.fallbackResolver =
      options.fallbackResolver ??
      new WorkspaceTypeResolver({
        createProgram: options.createProgram ?? createDefaultProgram,
      });
    this.findConfigFile =
      options.findConfigFile ??
      ((workspaceRoot) => ts.findConfigFile(workspaceRoot, ts.sys.fileExists) ?? null);
    this.runProbeCommand = options.runProbeCommand ?? defaultRunProbeCommand;
  }

  resolve(
    filePath: string,
    variableName: string,
    workspaceRoot: string,
    range: Range,
    options?: ResolveTypeOptions,
  ): ResolvedType {
    this.ensureWorkspaceProbe(workspaceRoot);
    return this.fallbackResolver.resolve(filePath, variableName, workspaceRoot, range, options);
  }

  invalidate(workspaceRoot: string): void {
    this.probeStateByWorkspace.delete(workspaceRoot);
    this.fallbackResolver.invalidate(workspaceRoot);
  }

  clear(): void {
    this.probeStateByWorkspace.clear();
    this.fallbackResolver.clear();
  }

  private ensureWorkspaceProbe(workspaceRoot: string): void {
    const cached = this.probeStateByWorkspace.get(workspaceRoot);
    if (cached) {
      if (!cached.ok) {
        throw new Error(`tsgo probe failed for workspace: ${workspaceRoot}`);
      }
      return;
    }

    const configPath = this.findConfigFile(workspaceRoot);
    if (!configPath) {
      this.probeStateByWorkspace.set(workspaceRoot, {
        configPath: null,
        ok: true,
      });
      return;
    }

    const result = this.runProbeCommand(workspaceRoot, configPath);
    if (result.status !== 0) {
      this.probeStateByWorkspace.set(workspaceRoot, {
        configPath,
        ok: false,
      });
      throw new Error(
        [
          `tsgo probe failed for workspace: ${workspaceRoot}`,
          `config: ${configPath}`,
          result.error ? `error: ${result.error.message}` : null,
          result.stderr.trim() ? `stderr: ${result.stderr.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    this.probeStateByWorkspace.set(workspaceRoot, {
      configPath,
      ok: true,
    });
  }
}

function defaultRunProbeCommand(workspaceRoot: string, configPath: string): TsgoProbeResult {
  const child: SpawnSyncReturns<string> = spawnSync(
    "pnpm",
    [
      "exec",
      "tsgo",
      "-p",
      configPath,
      "--pretty",
      "false",
      "--noEmit",
      ...resolveTsgoCheckerArgs(),
    ],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: "pipe",
      env: process.env,
    },
  );

  return {
    status: child.status,
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? "",
    ...(child.error ? { error: child.error } : {}),
  };
}

function resolveTsgoCheckerArgs(): readonly string[] {
  const value =
    process.env.CME_TSGO_CHECKERS?.trim() ?? process.env.CME_TSGO_PREVIEW_CHECKERS?.trim();
  if (!value) {
    return [];
  }
  return ["--checkers", value];
}
