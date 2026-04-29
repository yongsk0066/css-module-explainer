import { existsSync } from "node:fs";
import path from "node:path";

export type ClientLspServerRuntimeSetting = "auto" | "node" | "omena-lsp-server";

export interface OmenaLspServerRuntimeSelection {
  readonly runtime: "omena-lsp-server";
  readonly command: string;
  readonly args: readonly string[];
}

export interface NodeLspServerRuntimeSelection {
  readonly runtime: "node";
}

export type LspServerRuntimeSelection =
  | OmenaLspServerRuntimeSelection
  | NodeLspServerRuntimeSelection;

export function buildRustLspFileWatcherGlobs(): readonly string[] {
  return [
    "**/*.module.{scss,css,less}",
    "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,d.ts}",
    "**/tsconfig*.json",
    "**/jsconfig*.json",
  ];
}

export function readClientLspServerRuntimeSetting(value: unknown): ClientLspServerRuntimeSetting {
  if (value === "omena-lsp-server") return "omena-lsp-server";
  if (value === "node") return "node";
  return "auto";
}

export function resolveLspServerRuntimeSelection(
  runtime: ClientLspServerRuntimeSetting,
  extensionRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): LspServerRuntimeSelection {
  if (runtime === "node") {
    return { runtime: "node" };
  }

  const command = resolveOmenaLspServerPath(extensionRoot, env, fileExists);
  if (runtime === "auto" && !command) {
    return { runtime: "node" };
  }
  if (!command) {
    throw new Error(
      [
        "cssModuleExplainer.lspServerRuntime=omena-lsp-server requires an omena-lsp-server binary.",
        "Run pnpm build, or set CME_OMENA_LSP_SERVER_PATH to an explicit binary.",
      ].join("\n"),
    );
  }
  return { runtime: "omena-lsp-server", command, args: [] };
}

export function resolveOmenaLspServerPath(
  extensionRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): string | null {
  const explicitPath = env.CME_OMENA_LSP_SERVER_PATH?.trim();
  if (explicitPath) {
    const resolved = path.resolve(extensionRoot, explicitPath);
    if (fileExists(resolved)) return resolved;
    throw new Error(`CME_OMENA_LSP_SERVER_PATH points to a missing binary: ${resolved}`);
  }

  const binaryName = process.platform === "win32" ? "omena-lsp-server.exe" : "omena-lsp-server";
  const candidates = [
    path.join(extensionRoot, "dist", "bin", `${process.platform}-${process.arch}`, binaryName),
    path.join(extensionRoot, "rust", "target", "release", binaryName),
    path.join(extensionRoot, "rust", "target", "debug", binaryName),
  ];
  return candidates.find(fileExists) ?? null;
}
