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
import type { WorkspaceCheckerFinding } from "./contracts";

export interface CheckerCliIO {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
  readonly cwd: () => string;
}

export type CheckerCliFailOn = "none" | "warning" | "hint";
export type CheckerCliFormat = "text" | "json";
export type CheckerCliCategory = "all" | "source" | "style";
export type CheckerCliSeverity = "all" | "warning" | "hint";

export async function runCheckerCli(
  argv: readonly string[],
  io: CheckerCliIO = defaultCliIO(),
): Promise<number> {
  const parsed = parseCliArgs(argv, io.cwd());
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
  const filtered = filterResult(result, parsed.category, parsed.severity);
  writeResult(filtered, parsed.format, io);
  return shouldFail(filtered, parsed.failOn) ? 1 : 0;
}

interface ParsedCliOptions {
  readonly options: WorkspaceCheckOptions;
  readonly format: CheckerCliFormat;
  readonly failOn: CheckerCliFailOn;
  readonly category: CheckerCliCategory;
  readonly severity: CheckerCliSeverity;
}

function parseCliArgs(
  argv: readonly string[],
  cwd: string,
): ParsedCliOptions | { readonly helpText: string } | { readonly error: string } {
  let workspaceRoot = cwd;
  let format: CheckerCliFormat = "text";
  let failOn: CheckerCliFailOn = "warning";
  let category: CheckerCliCategory = "all";
  let severity: CheckerCliSeverity = "all";
  let classnameTransform: ClassnameTransformMode = "asIs";
  const pathAlias: Record<string, string> = {};
  const sourceFilePaths: string[] = [];
  const styleFilePaths: string[] = [];
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

    if (arg === "--fail-on") {
      const value = argv[index + 1];
      if (value !== "none" && value !== "warning" && value !== "hint") {
        return { error: "Expected --fail-on none|warning|hint" };
      }
      failOn = value;
      index += 1;
      continue;
    }

    if (arg === "--category") {
      const value = argv[index + 1];
      if (value !== "all" && value !== "source" && value !== "style") {
        return { error: "Expected --category all|source|style" };
      }
      category = value;
      index += 1;
      continue;
    }

    if (arg === "--severity") {
      const value = argv[index + 1];
      if (value !== "all" && value !== "warning" && value !== "hint") {
        return { error: "Expected --severity all|warning|hint" };
      }
      severity = value;
      index += 1;
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
  };
}

function writeResult(
  result: WorkspaceCheckResult,
  format: CheckerCliFormat,
  io: CheckerCliIO,
): void {
  if (format === "json") {
    io.stdout(
      `${JSON.stringify(
        {
          sourceFiles: result.sourceFiles,
          styleFiles: result.styleFiles,
          summary: result.summary,
          findings: result.findings.map(({ filePath, finding }) => ({
            filePath,
            category: finding.category,
            code: finding.code,
            severity: finding.severity,
            range: finding.range,
            message: formatCheckerFinding(finding, path.dirname(filePath)),
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  for (const { filePath, finding } of result.findings) {
    io.stdout(
      `${filePath}:${finding.range.start.line + 1}:${finding.range.start.character + 1} [${
        finding.severity
      }] ${finding.code} ${formatCheckerFinding(finding, path.dirname(filePath))}\n`,
    );
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
): WorkspaceCheckResult {
  const findings = result.findings.filter(({ finding }) => {
    if (category !== "all" && finding.category !== category) return false;
    if (severity !== "all" && finding.severity !== severity) return false;
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

function isSourceFilePath(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/u.test(filePath) || filePath.endsWith(".d.ts");
}

function buildHelpText(): string {
  return [
    "Usage: pnpm check:workspace -- [root] [options]",
    "",
    "Options:",
    "  --root <path>                 Workspace root (defaults to cwd)",
    "  --format <text|json>         Output format (default: text)",
    "  --fail-on <none|warning|hint> Exit threshold (default: warning)",
    "  --category <all|source|style> Filter findings by category",
    "  --severity <all|warning|hint> Filter findings by severity",
    "  --classname-transform <mode> Style transform mode",
    "  --path-alias <prefix=target> Repeatable native path-alias override",
    "  --source-file <path>         Restrict source checking to one file (repeatable)",
    "  --style-file <path>          Restrict style checking to one file (repeatable)",
    "  --changed-file <path>        Auto-route changed source/style file (repeatable)",
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
