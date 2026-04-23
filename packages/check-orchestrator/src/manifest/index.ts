import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyScript } from "./scopes";
import type {
  CheckBundle,
  CheckDiagnostic,
  CheckGate,
  CheckManifest,
  RootPackageJson,
} from "./types";

export type { CheckBundle, CheckDiagnostic, CheckGate, CheckManifest, CheckScopeId } from "./types";

const PACKAGE_SCRIPT_REF = /\bpnpm\s+(?:run\s+)?([A-Za-z0-9:_-]+)/g;

export function loadCheckManifest(rootDir = findRepoRoot()): CheckManifest {
  const packageJson = readRootPackageJson(rootDir);
  const scripts = packageJson.scripts ?? {};
  const diagnostics: CheckDiagnostic[] = [];
  const gates = Object.entries(scripts)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([scriptName, command]) => buildGate(scriptName, command, scripts, diagnostics));

  diagnostics.push(...findDuplicateGateIds(gates));

  return {
    rootDir,
    gates,
    bundles: gates.filter(
      (gate): gate is CheckBundle => gate.kind === "bundle" || gate.kind === "alias",
    ),
    diagnostics,
  };
}

export function resolveGateTarget(
  manifest: Pick<CheckManifest, "gates">,
  target: string,
): CheckGate | null {
  return (
    manifest.gates.find((gate) => gate.id === target || gate.scriptName === target) ??
    manifest.gates.find((gate) => gate.id.endsWith(`/${target}`)) ??
    null
  );
}

export function runDoctor(
  manifest: Pick<CheckManifest, "diagnostics">,
): readonly CheckDiagnostic[] {
  return manifest.diagnostics;
}

export function findRepoRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);
  while (true) {
    try {
      const candidate = readRootPackageJson(dir);
      if (candidate.name === "css-module-explainer") return dir;
    } catch {
      // Keep walking.
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Unable to locate css-module-explainer repo root from ${startDir}`);
    }
    dir = parent;
  }
}

function buildGate(
  scriptName: string,
  command: string,
  scripts: Record<string, string>,
  diagnostics: CheckDiagnostic[],
): CheckGate {
  const scope = classifyScript(scriptName);
  if (!scope) {
    diagnostics.push({
      severity: "error",
      code: "unknown-script-scope",
      message: `Script "${scriptName}" is not covered by a check-orchestrator scope.`,
    });
  }

  const referencedScripts = extractReferencedScripts(command, scripts);

  return {
    id: scope?.toGateId(scriptName) ?? `unknown/${scriptName.replace(":", "/")}`,
    scriptName,
    command,
    scope: scope?.id ?? "tooling",
    kind: detectGateKind(scriptName, command, referencedScripts),
    referencedScripts,
  };
}

function detectGateKind(
  scriptName: string,
  command: string,
  referencedScripts: readonly string[],
): CheckGate["kind"] {
  if (isAliasScript(command, referencedScripts)) return "alias";
  if (
    referencedScripts.length > 0 &&
    /(?:bundle|lane|readiness|shadow|verify|consumers|boundary)$/.test(scriptName)
  ) {
    return "bundle";
  }
  if (scriptName === "check" || scriptName.startsWith("check:") || scriptName.startsWith("test")) {
    return "gate";
  }
  return "command";
}

function isAliasScript(command: string, referencedScripts: readonly string[]): boolean {
  if (referencedScripts.length !== 1) return false;
  return /^pnpm\s+(?:run\s+)?[A-Za-z0-9:_-]+\s*$/.test(command.trim());
}

function extractReferencedScripts(
  command: string,
  scripts: Record<string, string>,
): readonly string[] {
  const refs = new Set<string>();
  for (const match of command.matchAll(PACKAGE_SCRIPT_REF)) {
    const scriptName = match[1];
    if (scriptName && Object.hasOwn(scripts, scriptName)) {
      refs.add(scriptName);
    }
  }
  return [...refs].toSorted();
}

function findDuplicateGateIds(gates: readonly CheckGate[]): readonly CheckDiagnostic[] {
  const byId = new Map<string, string[]>();
  for (const gate of gates) {
    const scripts = byId.get(gate.id) ?? [];
    scripts.push(gate.scriptName);
    byId.set(gate.id, scripts);
  }

  return [...byId.entries()]
    .filter(([, scripts]) => scripts.length > 1)
    .map(([id, scripts]) => ({
      severity: "error" as const,
      code: "duplicate-gate-id",
      message: `Gate id "${id}" is shared by scripts: ${scripts.join(", ")}`,
    }));
}

function readRootPackageJson(rootDir: string): RootPackageJson {
  const packageJsonPath = path.join(rootDir, "package.json");
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as RootPackageJson;
}
