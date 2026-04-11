import type { Connection } from "vscode-languageserver/node";
import type { ClassnameTransformMode } from "./core/scss/classname-transform";

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
    readonly missingModule: boolean;
  };
  readonly hover: {
    readonly maxCandidates: number;
  };
  readonly scss: {
    readonly classnameTransform: ClassnameTransformMode;
  };
  /**
   * Path alias map compat-read from the `cssModules.pathAlias`
   * config key (clinyong/vscode-cssmodules). Keys are import
   * prefixes (e.g. `"@styles"`), values are workspace-relative
   * or absolute target paths. Defaults to `{}`.
   *
   * Native `cssModuleExplainer.pathAlias` key is deferred to a
   * later wave. See `.personal_docs/research/2026-04-11-wave2b-path-resolution.md`.
   */
  readonly pathAlias: Readonly<Record<string, string>>;
}

const DEFAULTS: Settings = {
  features: { definition: true, hover: true, completion: true, references: true, rename: true },
  diagnostics: { severity: "warning", unusedSelector: true, missingModule: true },
  hover: { maxCandidates: 10 },
  scss: { classnameTransform: "asIs" },
  pathAlias: {},
};

const CLASSNAME_TRANSFORM_VALUES = [
  "asIs",
  "camelCase",
  "camelCaseOnly",
  "dashes",
  "dashesOnly",
] as const;

function isClassnameTransform(v: unknown): v is ClassnameTransformMode {
  return typeof v === "string" && (CLASSNAME_TRANSFORM_VALUES as readonly string[]).includes(v);
}

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
  const scss = isRecord(r.scss) ? r.scss : {};
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
      missingModule: parseBool(diagnostics.missingModule, DEFAULTS.diagnostics.missingModule),
    },
    hover: {
      maxCandidates: parseNumber(hover.maxCandidates, DEFAULTS.hover.maxCandidates),
    },
    scss: {
      classnameTransform: isClassnameTransform(scss.classnameTransform)
        ? scss.classnameTransform
        : DEFAULTS.scss.classnameTransform,
    },
    pathAlias: {},
  };
}

/**
 * Parse the `cssModules.pathAlias` record into a `Record<string, string>`.
 * Non-record inputs fall back to `{}`; record values that are not strings
 * are dropped (no coercion). Used only by `fetchSettings` which merges the
 * result into `Settings.pathAlias`.
 */
export function parsePathAlias(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

export async function fetchSettings(connection: Connection): Promise<Settings> {
  const [raw, compat]: [unknown, unknown] = await Promise.all([
    connection.workspace.getConfiguration("cssModuleExplainer"),
    connection.workspace.getConfiguration("cssModules"),
  ]);
  const base = parseSettings(raw);
  const pathAlias = parsePathAlias(isRecord(compat) ? compat.pathAlias : undefined);
  return { ...base, pathAlias };
}

export { DEFAULTS as DEFAULT_SETTINGS };
