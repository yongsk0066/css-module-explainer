import type { Connection } from "vscode-languageserver/node";

export interface Settings {
  readonly features: {
    readonly definition: boolean;
    readonly hover: boolean;
    readonly completion: boolean;
    readonly references: boolean;
  };
  readonly diagnostics: {
    readonly severity: "error" | "warning" | "information" | "hint";
    readonly unusedSelector: boolean;
  };
  readonly hover: {
    readonly maxCandidates: number;
  };
}

const DEFAULTS: Settings = {
  features: { definition: true, hover: true, completion: true, references: true },
  diagnostics: { severity: "warning", unusedSelector: true },
  hover: { maxCandidates: 10 },
};

export async function fetchSettings(connection: Connection): Promise<Settings> {
  const raw = await connection.workspace.getConfiguration("cssModuleExplainer");
  if (!raw) return DEFAULTS;
  return {
    features: {
      definition: raw.features?.definition ?? DEFAULTS.features.definition,
      hover: raw.features?.hover ?? DEFAULTS.features.hover,
      completion: raw.features?.completion ?? DEFAULTS.features.completion,
      references: raw.features?.references ?? DEFAULTS.features.references,
    },
    diagnostics: {
      severity: raw.diagnostics?.severity ?? DEFAULTS.diagnostics.severity,
      unusedSelector: raw.diagnostics?.unusedSelector ?? DEFAULTS.diagnostics.unusedSelector,
    },
    hover: {
      maxCandidates: raw.hover?.maxCandidates ?? DEFAULTS.hover.maxCandidates,
    },
  };
}

export { DEFAULTS as DEFAULT_SETTINGS };
