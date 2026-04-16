import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClassnameTransformMode } from "../scss/classname-transform";
import { findLangForPath } from "../scss/lang-registry";
import {
  checkWorkspace,
  type WorkspaceCheckOptions,
  type WorkspaceCheckResult,
  type WorkspaceCheckSummary,
} from "./check-workspace";
import { formatCheckerFinding } from "./format-checker-finding";
import type {
  CheckerReportJsonFinding,
  CheckerReportJsonV1,
  WorkspaceCheckerFinding,
} from "./contracts";

export interface CheckerCliIO {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
  readonly cwd: () => string;
  readonly stdin?: () => Promise<string>;
}

export type CheckerCliFailOn = "none" | "warning" | "hint";
export type CheckerCliFormat = "text" | "json";
export type CheckerCliCategory = "all" | "source" | "style";
export type CheckerCliSeverity = "all" | "warning" | "hint";
export type CheckerCliSummaryMode = "full" | "summary";
export type CheckerCliPreset = "ci" | "changed-style" | "changed-source";
const CHECKER_JSON_SCHEMA_VERSION = "1" as const;
const CHECKER_TOOL_NAME = "css-module-explainer/checker" as const;

export async function runCheckerCli(
  argv: readonly string[],
  io: CheckerCliIO = defaultCliIO(),
): Promise<number> {
  const parsed = await parseCliArgs(argv, io);
  if ("helpText" in parsed) {
    io.stdout(parsed.helpText);
    return 0;
  }
  if ("error" in parsed) {
    io.stderr(`${parsed.error}\n`);
    io.stderr(buildHelpText());
    return 2;
  }

  const result = await checkWorkspace(parsed.options);
  const filtered = filterResult(
    result,
    parsed.category,
    parsed.severity,
    parsed.includeCodes,
    parsed.excludeCodes,
  );
  writeResult(filtered, parsed.format, parsed.summaryMode, io);
  return shouldFail(filtered, parsed.failOn) ? 1 : 0;
}

interface ParsedCliOptions {
  readonly options: WorkspaceCheckOptions;
  readonly format: CheckerCliFormat;
  readonly failOn: CheckerCliFailOn;
  readonly category: CheckerCliCategory;
  readonly severity: CheckerCliSeverity;
  readonly summaryMode: CheckerCliSummaryMode;
  readonly includeCodes: readonly string[];
  readonly excludeCodes: readonly string[];
}

async function parseCliArgs(
  argv: readonly string[],
  io: CheckerCliIO,
): Promise<ParsedCliOptions | { readonly helpText: string } | { readonly error: string }> {
  const cwd = io.cwd();
  const stdinFileList = argv.includes("--stdin-file-list") ? await readStdinFileList(io) : null;
  let workspaceRoot = cwd;
  let preset: CheckerCliPreset | null = null;
  let format: CheckerCliFormat = "text";
  let failOn: CheckerCliFailOn = "warning";
  let category: CheckerCliCategory = "all";
  let severity: CheckerCliSeverity = "all";
  let summaryMode: CheckerCliSummaryMode = "full";
  let explicitFailOn = false;
  let explicitCategory = false;
  let explicitSeverity = false;
  let explicitSummaryMode = false;
  let classnameTransform: ClassnameTransformMode = "asIs";
  const pathAlias: Record<string, string> = {};
  const sourceFilePaths: string[] = [];
  const styleFilePaths: string[] = [];
  const includeCodes: string[] = [];
  const excludeCodes: string[] = [];
  let hasExplicitFileSelection = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { helpText: buildHelpText() };
    }

    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) return { error: "Missing value for --root" };
      workspaceRoot = path.resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--format") {
      const value = argv[index + 1];
      if (value !== "text" && value !== "json") {
        return { error: "Expected --format text|json" };
      }
      format = value;
      index += 1;
      continue;
    }

    if (arg === "--preset") {
      const value = argv[index + 1];
      if (value !== "ci" && value !== "changed-style" && value !== "changed-source") {
        return { error: "Expected --preset ci|changed-style|changed-source" };
      }
      preset = value;
      index += 1;
      continue;
    }

    if (arg === "--fail-on") {
      const value = argv[index + 1];
      if (value !== "none" && value !== "warning" && value !== "hint") {
        return { error: "Expected --fail-on none|warning|hint" };
      }
      failOn = value;
      explicitFailOn = true;
      index += 1;
      continue;
    }

    if (arg === "--category") {
      const value = argv[index + 1];
      if (value !== "all" && value !== "source" && value !== "style") {
        return { error: "Expected --category all|source|style" };
      }
      category = value;
      explicitCategory = true;
      index += 1;
      continue;
    }

    if (arg === "--severity") {
      const value = argv[index + 1];
      if (value !== "all" && value !== "warning" && value !== "hint") {
        return { error: "Expected --severity all|warning|hint" };
      }
      severity = value;
      explicitSeverity = true;
      index += 1;
      continue;
    }

    if (arg === "--summary") {
      summaryMode = "summary";
      explicitSummaryMode = true;
      continue;
    }

    if (arg === "--classname-transform") {
      const value = argv[index + 1];
      if (
        value !== "asIs" &&
        value !== "camelCase" &&
        value !== "camelCaseOnly" &&
        value !== "dashes" &&
        value !== "dashesOnly"
      ) {
        return {
          error: "Expected --classname-transform asIs|camelCase|camelCaseOnly|dashes|dashesOnly",
        };
      }
      classnameTransform = value;
      index += 1;
      continue;
    }

    if (arg === "--path-alias") {
      const value = argv[index + 1];
      if (!value || !value.includes("=")) {
        return { error: "Expected --path-alias prefix=target" };
      }
      const eq = value.indexOf("=");
      const key = value.slice(0, eq);
      const target = value.slice(eq + 1);
      if (!key || !target) {
        return { error: "Expected --path-alias prefix=target" };
      }
      pathAlias[key] = target;
      index += 1;
      continue;
    }

    if (arg === "--include-code") {
      const value = argv[index + 1];
      if (!value) return { error: "Missing value for --include-code" };
      includeCodes.push(value);
      index += 1;
      continue;
    }

    if (arg === "--exclude-code") {
      const value = argv[index + 1];
      if (!value) return { error: "Missing value for --exclude-code" };
      excludeCodes.push(value);
      index += 1;
      continue;
    }

    if (arg === "--file-list") {
      const value = argv[index + 1];
      if (!value) return { error: "Missing value for --file-list" };
      hasExplicitFileSelection = true;
      addFileListEntries(readFileList(path.resolve(workspaceRoot, value)), workspaceRoot, {
        sourceFilePaths,
        styleFilePaths,
      });
      index += 1;
      continue;
    }

    if (arg === "--stdin-file-list") {
      hasExplicitFileSelection = true;
      addFileListEntries(stdinFileList ?? [], workspaceRoot, {
        sourceFilePaths,
        styleFilePaths,
      });
      continue;
    }

    if (arg === "--source-file") {
      const value = argv[index + 1];
      if (!value) return { error: "Missing value for --source-file" };
      sourceFilePaths.push(path.resolve(workspaceRoot, value));
      hasExplicitFileSelection = true;
      index += 1;
      continue;
    }

    if (arg === "--style-file") {
      const value = argv[index + 1];
      if (!value) return { error: "Missing value for --style-file" };
      styleFilePaths.push(path.resolve(workspaceRoot, value));
      hasExplicitFileSelection = true;
      index += 1;
      continue;
    }

    if (arg === "--changed-file") {
      const value = argv[index + 1];
      if (!value) return { error: "Missing value for --changed-file" };
      const changedPath = path.resolve(workspaceRoot, value);
      hasExplicitFileSelection = true;
      if (isSourceFilePath(changedPath)) {
        sourceFilePaths.push(changedPath);
      } else if (findLangForPath(changedPath)) {
        styleFilePaths.push(changedPath);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      return { error: `Unknown option: ${arg}` };
    }

    workspaceRoot = path.resolve(cwd, arg);
  }

  if (preset) {
    const defaults = presetDefaults(preset);
    if (!explicitFailOn) failOn = defaults.failOn;
    if (!explicitCategory) category = defaults.category;
    if (!explicitSeverity) severity = defaults.severity;
    if (!explicitSummaryMode) summaryMode = defaults.summaryMode;
  }

  return {
    options: {
      workspaceRoot,
      classnameTransform,
      pathAlias,
      ...(hasExplicitFileSelection
        ? {
            sourceFilePaths: [...new Set(sourceFilePaths)],
            styleFilePaths: [...new Set(styleFilePaths)],
          }
        : {}),
    },
    format,
    failOn,
    category,
    severity,
    summaryMode,
    includeCodes: [...new Set(includeCodes)],
    excludeCodes: [...new Set(excludeCodes)],
  };
}

function presetDefaults(preset: CheckerCliPreset): {
  readonly failOn: CheckerCliFailOn;
  readonly category: CheckerCliCategory;
  readonly severity: CheckerCliSeverity;
  readonly summaryMode: CheckerCliSummaryMode;
} {
  switch (preset) {
    case "ci":
      return {
        failOn: "warning",
        category: "all",
        severity: "warning",
        summaryMode: "summary",
      };
    case "changed-style":
      return {
        failOn: "warning",
        category: "style",
        severity: "all",
        summaryMode: "summary",
      };
    case "changed-source":
      return {
        failOn: "warning",
        category: "source",
        severity: "all",
        summaryMode: "summary",
      };
    default:
      preset satisfies never;
      return {
        failOn: "warning",
        category: "all",
        severity: "all",
        summaryMode: "full",
      };
  }
}

function writeResult(
  result: WorkspaceCheckResult,
  format: CheckerCliFormat,
  summaryMode: CheckerCliSummaryMode,
  io: CheckerCliIO,
): void {
  if (format === "json") {
    io.stdout(`${JSON.stringify(buildJsonReport(result), null, 2)}\n`);
    return;
  }

  if (summaryMode === "full") {
    for (const { filePath, finding } of result.findings) {
      io.stdout(
        `${filePath}:${finding.range.start.line + 1}:${finding.range.start.character + 1} [${
          finding.severity
        }] ${finding.code} ${formatCheckerFinding(finding, path.dirname(filePath))}\n`,
      );
    }
  }

  io.stdout(
    `Checked ${result.sourceFiles.length} source files and ${result.styleFiles.length} style modules. ` +
      `${result.summary.total} findings (${result.summary.warnings} warnings, ${result.summary.hints} hints).\n`,
  );
}

function shouldFail(result: WorkspaceCheckResult, failOn: CheckerCliFailOn): boolean {
  if (failOn === "none") return false;
  if (failOn === "hint") return result.summary.total > 0;
  return result.summary.warnings > 0;
}

function filterResult(
  result: WorkspaceCheckResult,
  category: CheckerCliCategory,
  severity: CheckerCliSeverity,
  includeCodes: readonly string[],
  excludeCodes: readonly string[],
): WorkspaceCheckResult {
  const findings = result.findings.filter(({ finding }) => {
    if (category !== "all" && finding.category !== category) return false;
    if (severity !== "all" && finding.severity !== severity) return false;
    if (includeCodes.length > 0 && !includeCodes.includes(finding.code)) return false;
    if (excludeCodes.includes(finding.code)) return false;
    return true;
  });
  return {
    ...result,
    findings,
    summary: summarizeFilteredFindings(findings),
  };
}

function summarizeFilteredFindings(
  findings: readonly WorkspaceCheckerFinding[],
): WorkspaceCheckSummary {
  let warnings = 0;
  let hints = 0;
  for (const { finding } of findings) {
    if (finding.severity === "warning") warnings += 1;
    if (finding.severity === "hint") hints += 1;
  }
  return {
    warnings,
    hints,
    total: findings.length,
  };
}

function buildJsonReport(result: WorkspaceCheckResult): CheckerReportJsonV1 {
  return {
    schemaVersion: CHECKER_JSON_SCHEMA_VERSION,
    tool: CHECKER_TOOL_NAME,
    sourceFiles: result.sourceFiles,
    styleFiles: result.styleFiles,
    summary: result.summary,
    findings: result.findings.map(
      ({ filePath, finding }): CheckerReportJsonFinding => ({
        filePath,
        category: finding.category,
        code: finding.code,
        severity: finding.severity,
        range: finding.range,
        message: formatCheckerFinding(finding, path.dirname(filePath)),
      }),
    ),
  };
}

function isSourceFilePath(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/u.test(filePath) || filePath.endsWith(".d.ts");
}

function addFileListEntries(
  entries: readonly string[],
  workspaceRoot: string,
  acc: {
    readonly sourceFilePaths: string[];
    readonly styleFilePaths: string[];
  },
): void {
  for (const entry of entries) {
    const resolved = path.resolve(workspaceRoot, entry);
    if (isSourceFilePath(resolved)) {
      acc.sourceFilePaths.push(resolved);
      continue;
    }
    if (findLangForPath(resolved)) {
      acc.styleFilePaths.push(resolved);
    }
  }
}

function readFileList(filePath: string): readonly string[] {
  return parseFileList(readFileSync(filePath, "utf8"));
}

async function readStdinFileList(io: CheckerCliIO): Promise<readonly string[]> {
  const raw = io.stdin ? await io.stdin() : await readProcessStdin();
  return parseFileList(raw);
}

function parseFileList(raw: string): readonly string[] {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function readProcessStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", reject);
  });
}

function buildHelpText(): string {
  return [
    "Usage: pnpm check:workspace -- [root] [options]",
    "",
    "Options:",
    "  --root <path>                 Workspace root (defaults to cwd)",
    "  --format <text|json>         Output format (default: text)",
    "  --preset <ci|changed-style|changed-source> Apply a preset bundle",
    "  --fail-on <none|warning|hint> Exit threshold (default: warning)",
    "  --category <all|source|style> Filter findings by category",
    "  --severity <all|warning|hint> Filter findings by severity",
    "  --summary                    Print summary only for text output",
    "  --classname-transform <mode> Style transform mode",
    "  --path-alias <prefix=target> Repeatable native path-alias override",
    "  --include-code <code>        Restrict findings to one rule code (repeatable)",
    "  --exclude-code <code>        Remove one rule code from output (repeatable)",
    "  --source-file <path>         Restrict source checking to one file (repeatable)",
    "  --style-file <path>          Restrict style checking to one file (repeatable)",
    "  --changed-file <path>        Auto-route changed source/style file (repeatable)",
    "  --file-list <path>           Read changed file paths from a newline-delimited file",
    "  --stdin-file-list            Read changed file paths from stdin",
    "  --help                       Show this help",
    "",
  ].join("\n");
}

function defaultCliIO(): CheckerCliIO {
  return {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
    cwd: () => process.cwd(),
  };
}
