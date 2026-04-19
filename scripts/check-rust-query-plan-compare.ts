import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertQueryPlanSummaryMatch,
  deriveTsQueryPlanSummary,
  runShadowQueryPlanInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-query-plan-compare:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsQueryPlanSummary(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowQueryPlanInput(snapshot.input);

    assertQueryPlanSummaryMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched query plan: expr=${actual.expressionSemanticsIds.length} selectorUsage=${actual.selectorUsageIds.length} total=${actual.totalQueryCount}\n\n`,
    );
  }
})();
