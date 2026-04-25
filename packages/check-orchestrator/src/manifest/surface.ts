import { buildCheckPlan } from "./plan";
import type {
  CheckAliasChain,
  CheckBundleSurface,
  CheckGate,
  CheckManifest,
  CheckSurfaceReport,
} from "./types";

export function buildCheckSurfaceReport(
  manifest: Pick<CheckManifest, "gates">,
): CheckSurfaceReport {
  const gates = manifest.gates;
  const aliasChains = findAliasChains(gates);
  const largestBundles = gates
    .filter((gate) => gate.kind === "bundle")
    .map((gate) => buildBundleSurface(manifest, gate))
    .toSorted((left, right) => {
      const leafDelta = right.uniqueLeafCount - left.uniqueLeafCount;
      return leafDelta || left.id.localeCompare(right.id);
    });

  return {
    totalGates: gates.length,
    gateCount: gates.filter((gate) => gate.kind === "gate").length,
    bundleCount: gates.filter((gate) => gate.kind === "bundle").length,
    aliasCount: gates.filter((gate) => gate.kind === "alias").length,
    commandCount: gates.filter((gate) => gate.kind === "command").length,
    aliasChains,
    largestBundles,
  };
}

export function renderCheckSurfaceReport(report: CheckSurfaceReport): string {
  const topBundles = report.largestBundles.slice(0, 10);
  return [
    "Check surface",
    "",
    `Total gates: ${report.totalGates}`,
    `Kinds: gates=${report.gateCount} bundles=${report.bundleCount} aliases=${report.aliasCount} commands=${report.commandCount}`,
    `Alias chains: ${report.aliasChains.length}`,
    "",
    "Largest bundles by unique leaf dependencies:",
    ...topBundles.map(
      (bundle) =>
        `- ${bundle.id} (${bundle.scriptName}): leaves=${bundle.uniqueLeafCount} steps=${bundle.totalStepCount} repeated=${bundle.repeatedStepCount} maxDepth=${bundle.maxDepth}`,
    ),
  ].join("\n");
}

export function findAliasChains(gates: readonly CheckGate[]): readonly CheckAliasChain[] {
  const byScriptName = new Map(gates.map((gate) => [gate.scriptName, gate]));
  const chains: CheckAliasChain[] = [];

  for (const gate of gates) {
    if (gate.kind !== "alias") continue;
    for (const referencedScript of gate.referencedScripts) {
      const referencedGate = byScriptName.get(referencedScript);
      if (referencedGate?.kind !== "alias") continue;
      chains.push({
        aliasId: gate.id,
        aliasScriptName: gate.scriptName,
        referencedAliasId: referencedGate.id,
        referencedAliasScriptName: referencedGate.scriptName,
        directTargetScripts: referencedGate.referencedScripts,
      });
    }
  }

  return chains;
}

function buildBundleSurface(
  manifest: Pick<CheckManifest, "gates">,
  gate: CheckGate,
): CheckBundleSurface {
  const plan = buildCheckPlan(manifest, gate);
  const leafScripts = new Set<string>();
  let repeatedStepCount = 0;
  let maxDepth = 0;

  for (const step of plan.steps.slice(1)) {
    if (step.repeated) repeatedStepCount += 1;
    if (step.depth > maxDepth) maxDepth = step.depth;
    if (step.kind === "bundle" || step.kind === "alias") continue;
    leafScripts.add(step.scriptName);
  }

  return {
    id: gate.id,
    scriptName: gate.scriptName,
    scope: gate.scope,
    kind: gate.kind,
    uniqueLeafCount: leafScripts.size,
    totalStepCount: Math.max(0, plan.steps.length - 1),
    repeatedStepCount,
    maxDepth,
  };
}
