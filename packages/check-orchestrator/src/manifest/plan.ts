import type { CheckGate, CheckManifest, CheckPlan, CheckPlanStep } from "./types";

export function buildCheckPlan(
  manifest: Pick<CheckManifest, "gates">,
  target: CheckGate,
): CheckPlan {
  const gatesByScriptName = new Map(manifest.gates.map((gate) => [gate.scriptName, gate]));
  const steps: CheckPlanStep[] = [];
  const expanded = new Set<string>();
  const stack = new Set<string>();

  visit(target, 0);

  return {
    target,
    steps,
  };

  function visit(gate: CheckGate, depth: number): void {
    const cycle = stack.has(gate.scriptName);
    const repeated = expanded.has(gate.scriptName);

    steps.push({
      id: gate.id,
      scriptName: gate.scriptName,
      scope: gate.scope,
      kind: gate.kind,
      depth,
      referencedScripts: gate.referencedScripts,
      repeated,
      cycle,
    });

    if (cycle || repeated) return;

    expanded.add(gate.scriptName);
    stack.add(gate.scriptName);
    for (const referencedScript of gate.referencedScripts) {
      const referencedGate = gatesByScriptName.get(referencedScript);
      if (referencedGate) {
        visit(referencedGate, depth + 1);
      }
    }
    stack.delete(gate.scriptName);
  }
}

export function renderCheckPlan(plan: CheckPlan): string {
  return [
    `Check plan: ${plan.target.id} (${plan.target.scriptName})`,
    "",
    ...plan.steps.map((step) => {
      const markers = [step.repeated ? "repeated" : null, step.cycle ? "cycle" : null].filter(
        Boolean,
      );
      const suffix = markers.length > 0 ? ` [${markers.join(", ")}]` : "";
      return `${"  ".repeat(step.depth)}- ${step.id} (${step.scriptName}, ${step.kind})${suffix}`;
    }),
  ].join("\n");
}
