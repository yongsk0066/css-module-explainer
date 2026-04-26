import {
  runShadowExpressionDomainCandidatesInput,
  runShadowExpressionDomainEvaluatorCandidatesInput,
  runShadowExpressionDomainFragmentsInput,
} from "./rust-shadow-shared";
import type { EngineInputV2, StringTypeFactsV2 } from "../server/engine-core-ts/src/contracts";

const INPUT: EngineInputV2 = {
  version: "2",
  workspace: {
    root: "/tmp/cme-expression-domain-reduced-evaluator",
    classnameTransform: "asIs",
    settingsKey: "synthetic-expression-domain-reduced-evaluator",
  },
  sources: [],
  styles: [],
  typeFacts: [
    fact("finite-prefix-exact", {
      kind: "finiteSet",
      values: ["btn-active", "card"],
      constraintKind: "prefix",
      prefix: "btn-",
    }),
    fact("finite-prefix-bottom", {
      kind: "finiteSet",
      values: ["card", "nav"],
      constraintKind: "prefix",
      prefix: "btn-",
    }),
    fact("constrained-prefix-values-finite", {
      kind: "constrained",
      values: ["btn-primary", "btn-secondary", "card"],
      constraintKind: "prefix",
      prefix: "btn-",
    }),
    fact("constrained-composite", {
      kind: "constrained",
      constraintKind: "composite",
      prefix: "btn-",
      suffix: "-active",
      minLen: 14,
      charMust: "-",
      charMay: "abcdefghijklmnopqrstuvwxyz-",
      mayIncludeOtherChars: false,
    }),
  ],
};

const EXPECTED_RAW_KINDS = new Map(
  INPUT.typeFacts.map((entry) => [entry.expressionId, entry.facts.kind]),
);

const EXPECTED_REDUCED_EVALUATOR_KINDS = new Map([
  ["finite-prefix-exact", "exact"],
  ["finite-prefix-bottom", "bottom"],
  ["constrained-prefix-values-finite", "finiteSet"],
  ["constrained-composite", "composite"],
]);

void (async () => {
  process.stdout.write("== rust-expression-domain-reduced-evaluator:synthetic ==\n");

  const fragments = await runShadowExpressionDomainFragmentsInput(INPUT);
  const candidates = await runShadowExpressionDomainCandidatesInput(INPUT);
  const evaluatorCandidates = await runShadowExpressionDomainEvaluatorCandidatesInput(INPUT);

  for (const fragment of fragments.fragments) {
    assertEqual(
      fragment.valueDomainKind,
      EXPECTED_RAW_KINDS.get(fragment.expressionId),
      `${fragment.expressionId}: raw fragment must preserve input fact kind`,
    );
  }

  for (const candidate of candidates.candidates) {
    assertEqual(
      candidate.valueDomainKind,
      EXPECTED_RAW_KINDS.get(candidate.expressionId),
      `${candidate.expressionId}: raw candidate must preserve input fact kind`,
    );
  }

  for (const result of evaluatorCandidates.results) {
    assertEqual(
      result.payload.valueDomainKind,
      EXPECTED_REDUCED_EVALUATOR_KINDS.get(result.queryId),
      `${result.queryId}: evaluator candidate must expose reduced fact kind`,
    );
  }

  process.stdout.write(
    `validated reduced evaluator split: raw=${fragments.fragments.length} evaluator=${evaluatorCandidates.results.length}\n`,
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
