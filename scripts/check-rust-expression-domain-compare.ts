import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertExpressionDomainPlanSummaryMatch,
  deriveTsExpressionDomainPlanSummary,
  runShadowExpressionDomainInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-expression-domain-compare:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionDomainPlanSummary(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionDomainInput(snapshot.input);

    assertExpressionDomainPlanSummaryMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched expression domain plan: expressions=${actual.plannedExpressionIds.length} finiteValues=${actual.finiteValueCount}\n\n`,
    );
  }
})();
