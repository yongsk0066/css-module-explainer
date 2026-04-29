import ts from "typescript";

export const DEFAULT_MAX_SYNC_PROGRAM_FILES = 500;

/**
 * Minimal production ts.Program builder.
 *
 * This is shared by the language-server runtime and batch-style checker
 * entrypoints so both resolve TypeScript unions through the same default
 * workspace program policy.
 */
export function createDefaultProgram(workspaceRoot: string): ts.Program {
  try {
    const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) return createEmptyProgram();

    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    });
    if (!parsed) return createEmptyProgram();

    const maxSyncProgramFiles = resolveMaxSyncProgramFiles(process.env);
    if (maxSyncProgramFiles !== null && parsed.fileNames.length > maxSyncProgramFiles) {
      return createEmptyProgram();
    }

    return ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      projectReferences: parsed.projectReferences ?? [],
    });
  } catch {
    return createEmptyProgram();
  }
}

export function resolveMaxSyncProgramFiles(env: NodeJS.ProcessEnv = process.env): number | null {
  const value = env.CME_TYPE_FACT_MAX_SYNC_PROGRAM_FILES?.trim();
  if (!value) return DEFAULT_MAX_SYNC_PROGRAM_FILES;
  if (value === "0" || value === "off" || value === "unbounded") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_SYNC_PROGRAM_FILES;
  }

  return Math.floor(parsed);
}

function createEmptyProgram(): ts.Program {
  return ts.createProgram({
    rootNames: [],
    options: { allowJs: true, jsx: ts.JsxEmit.Preserve },
  });
}
