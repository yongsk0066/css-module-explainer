import { spawnSync } from "node:child_process";
import { loadCheckManifest, resolveGateTarget, runDoctor } from "../manifest/index";

interface ParsedArgs {
  readonly command: string;
  readonly target: string | null;
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly extraArgs: readonly string[];
}

const parsedArgs = parseArgs(process.argv.slice(2));
const manifest = loadCheckManifest();

switch (parsedArgs.command) {
  case "list":
    printList(parsedArgs.json);
    break;
  case "run":
    runTarget(parsedArgs, false);
    break;
  case "bundle":
    runTarget(parsedArgs, true);
    break;
  case "doctor":
    runDoctorCommand(parsedArgs.json);
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    fail(`Unknown command "${parsedArgs.command}". Run "pnpm cme-check help".`);
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const separatorIndex = argv.indexOf("--");
  const visibleArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const extraArgs = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
  const flags = new Set(visibleArgs.filter((arg) => arg.startsWith("-")));
  const positionals = visibleArgs.filter((arg) => !arg.startsWith("-"));

  return {
    command: positionals[0] ?? "help",
    target: positionals[1] ?? null,
    dryRun: flags.has("--dry") || flags.has("--dry-run"),
    json: flags.has("--json"),
    extraArgs,
  };
}

function printList(json: boolean): void {
  if (json) {
    console.log(
      JSON.stringify(
        manifest.gates.map(({ id, scriptName, scope, kind, referencedScripts }) => ({
          id,
          scriptName,
          scope,
          kind,
          referencedScripts,
        })),
        null,
        2,
      ),
    );
    return;
  }

  const rows = manifest.gates.map((gate) => [
    gate.id.padEnd(48),
    gate.kind.padEnd(7),
    gate.scope.padEnd(9),
    gate.scriptName,
  ]);
  console.log("id".padEnd(48), "kind".padEnd(7), "scope".padEnd(9), "script");
  console.log("-".repeat(92));
  for (const row of rows) {
    console.log(row.join("  "));
  }
}

function runTarget(parsed: ParsedArgs, bundleOnly: boolean): void {
  if (!parsed.target) {
    fail(`Missing target. Run "pnpm cme-check ${parsed.command} <id-or-script>".`);
  }

  const gate = resolveGateTarget(manifest, parsed.target);
  if (!gate) {
    fail(`Unknown target "${parsed.target}". Run "pnpm cme-check list".`);
  }
  if (bundleOnly && gate.kind !== "bundle" && gate.kind !== "alias") {
    fail(`Target "${parsed.target}" is not a bundle. Use "pnpm cme-check run ${gate.id}".`);
  }

  const command = ["pnpm", "run", gate.scriptName, ...parsed.extraArgs];
  if (parsed.dryRun) {
    console.log(command.join(" "));
    return;
  }

  const result = spawnSync(command[0]!, command.slice(1), {
    cwd: manifest.rootDir,
    stdio: "inherit",
    shell: false,
  });
  process.exit(result.status ?? 1);
}

function runDoctorCommand(json: boolean): void {
  const diagnostics = runDoctor(manifest);
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  if (json) {
    console.log(JSON.stringify({ errorCount, warningCount, diagnostics }, null, 2));
  } else if (diagnostics.length === 0) {
    console.log(`check-orchestrator doctor: ok (${manifest.gates.length} scripts mirrored)`);
  } else {
    for (const diagnostic of diagnostics) {
      console.log(`${diagnostic.severity}: ${diagnostic.code}: ${diagnostic.message}`);
    }
  }

  process.exit(errorCount === 0 ? 0 : 1);
}

function printHelp(): void {
  console.log(`Usage:
  pnpm cme-check list [--json]
  pnpm cme-check run <id-or-script> [--dry] [-- extra args]
  pnpm cme-check bundle <id-or-script> [--dry] [-- extra args]
  pnpm cme-check doctor [--json]
`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
