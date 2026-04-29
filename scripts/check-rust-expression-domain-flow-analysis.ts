import {
  runShadowExpressionDomainFlowAnalysisInput,
  type EngineInputV2,
  type StringTypeFactsV2,
} from "./rust-shadow-shared";

const INPUT: EngineInputV2 = {
  version: "2",
  workspace: {
    root: "/tmp/cme-expression-domain-flow-analysis",
    classnameTransform: "asIs",
    settingsKey: "synthetic-expression-domain-flow-analysis",
  },
  sources: [],
  styles: [],
  typeFacts: [
    fact("expr-branch-a", {
      kind: "exact",
      values: ["btn-primary"],
    }),
    fact("expr-branch-b", {
      kind: "exact",
      values: ["btn-secondary"],
    }),
    fact("expr-branch-c", {
      kind: "exact",
      values: ["card"],
    }),
  ],
};

void (async () => {
  process.stdout.write("== rust-expression-domain-flow-analysis:synthetic ==\n");

  const summary = await runShadowExpressionDomainFlowAnalysisInput(INPUT);
  const analysis = summary.analyses[0]?.analysis;
  const merge = analysis?.nodes.find((node) => node.id === "file-merge");

  assertEqual(summary.product, "engine-input-producers.expression-domain-flow-analysis", "product");
  assertEqual(analysis?.contextSensitivity, "1-cfa", "context sensitivity");
  assertEqual(analysis?.converged, true, "flow convergence");
  assertEqual(merge?.transferKind, "join", "merge transfer kind");
  assertEqual(merge?.valueKind, "finiteSet", "merge value kind");
  assertEqual(
    JSON.stringify(merge?.value),
    JSON.stringify({
      kind: "finiteSet",
      values: ["btn-primary", "btn-secondary", "card"],
    }),
    "merge abstract value",
  );

  process.stdout.write(
    `validated expression-domain flow analysis: graphs=${summary.analyses.length} nodes=${analysis?.nodes.length ?? 0}\n`,
  );
})();

function fact(expressionId: string, facts: StringTypeFactsV2) {
  return {
    filePath: "/tmp/App.tsx",
    expressionId,
    facts,
  };
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`,
    );
  }
}
