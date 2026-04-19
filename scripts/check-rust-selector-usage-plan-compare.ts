import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertSelectorUsagePlanSummaryMatch,
  deriveTsSelectorUsagePlanSummary,
  runShadowSelectorUsagePlanInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-selector-usage-plan-compare:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSelectorUsagePlanSummary(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSelectorUsagePlanInput(snapshot.input);

    assertSelectorUsagePlanSummaryMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched selector usage plan: canonical=${actual.canonicalSelectorNames.length} composed=${actual.composedSelectorCount} composesRefs=${actual.totalComposesRefs}\n\n`,
    );
  }
})();
