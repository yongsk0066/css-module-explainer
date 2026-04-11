import type { Connection } from "vscode-languageserver/node";

export interface Settings {
  readonly features: {
    readonly definition: boolean;
    readonly hover: boolean;
    readonly completion: boolean;
    readonly references: boolean;
    readonly rename: boolean;
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
  features: { definition: true, hover: true, completion: true, references: true, rename: true },
  diagnostics: { severity: "warning", unusedSelector: true },
  hover: { maxCandidates: 10 },
};

const SEVERITY_VALUES = ["error", "warning", "information", "hint"] as const;
type Severity = (typeof SEVERITY_VALUES)[number];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (SEVERITY_VALUES as readonly string[]).includes(v);
}
function parseBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function parseNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function parseSettings(raw: unknown): Settings {
  const r = isRecord(raw) ? raw : {};
  const features = isRecord(r.features) ? r.features : {};
  const diagnostics = isRecord(r.diagnostics) ? r.diagnostics : {};
  const hover = isRecord(r.hover) ? r.hover : {};
  return {
    features: {
      definition: parseBool(features.definition, DEFAULTS.features.definition),
      hover: parseBool(features.hover, DEFAULTS.features.hover),
      completion: parseBool(features.completion, DEFAULTS.features.completion),
      references: parseBool(features.references, DEFAULTS.features.references),
      rename: parseBool(features.rename, DEFAULTS.features.rename),
    },
    diagnostics: {
      severity: isSeverity(diagnostics.severity)
        ? diagnostics.severity
        : DEFAULTS.diagnostics.severity,
      unusedSelector: parseBool(diagnostics.unusedSelector, DEFAULTS.diagnostics.unusedSelector),
    },
    hover: {
      maxCandidates: parseNumber(hover.maxCandidates, DEFAULTS.hover.maxCandidates),
    },
  };
}

export async function fetchSettings(connection: Connection): Promise<Settings> {
  const raw: unknown = await connection.workspace.getConfiguration("cssModuleExplainer");
  return parseSettings(raw);
}

export { DEFAULTS as DEFAULT_SETTINGS };
