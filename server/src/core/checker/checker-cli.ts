import path from "node:path";
import type { ClassnameTransformMode } from "../scss/classname-transform";
import {
  checkWorkspace,
  type WorkspaceCheckOptions,
  type WorkspaceCheckResult,
} from "./check-workspace";
import { formatCheckerFinding } from "./format-checker-finding";

export interface CheckerCliIO {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
  readonly cwd: () => string;
}

export type CheckerCliFailOn = "none" | "warning" | "hint";
export type CheckerCliFormat = "text" | "json";

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
  writeResult(result, parsed.format, io);
  return shouldFail(result, parsed.failOn) ? 1 : 0;
}

interface ParsedCliOptions {
  readonly options: WorkspaceCheckOptions;
  readonly format: CheckerCliFormat;
  readonly failOn: CheckerCliFailOn;
}

function parseCliArgs(
  argv: readonly string[],
  cwd: string,
): ParsedCliOptions | { readonly helpText: string } | { readonly error: string } {
  let workspaceRoot = cwd;
  let format: CheckerCliFormat = "text";
  let failOn: CheckerCliFailOn = "warning";
  let classnameTransform: ClassnameTransformMode = "asIs";
  const pathAlias: Record<string, string> = {};

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
    },
    format,
    failOn,
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

function buildHelpText(): string {
  return [
    "Usage: pnpm check:workspace -- [root] [options]",
    "",
    "Options:",
    "  --root <path>                 Workspace root (defaults to cwd)",
    "  --format <text|json>         Output format (default: text)",
    "  --fail-on <none|warning|hint> Exit threshold (default: warning)",
    "  --classname-transform <mode> Style transform mode",
    "  --path-alias <prefix=target> Repeatable native path-alias override",
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
