import ts from "typescript";

/**
 * Minimal production ts.Program builder.
 *
 * This is shared by the language-server runtime and batch-style checker
 * entrypoints so both resolve TypeScript unions through the same default
 * workspace program policy.
 */
export function createDefaultProgram(workspaceRoot: string): ts.Program {
  const EMPTY = ts.createProgram({
    rootNames: [],
    options: { allowJs: true, jsx: ts.JsxEmit.Preserve },
  });

  try {
    const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) return EMPTY;

    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    });
    if (!parsed) return EMPTY;

    return ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      projectReferences: parsed.projectReferences ?? [],
    });
  } catch {
    return EMPTY;
  }
}
