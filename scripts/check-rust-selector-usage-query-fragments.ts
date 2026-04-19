import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertSelectorUsageQueryFragmentsMatch,
  deriveTsSelectorUsageQueryFragments,
  runShadowSelectorUsageQueryFragmentsInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-selector-usage-query-fragments:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSelectorUsageQueryFragments(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSelectorUsageQueryFragmentsInput(snapshot.input);

    assertSelectorUsageQueryFragmentsMatch(entry.label, actual, expected);

    process.stdout.write(`matched selector usage query fragments: ${actual.fragments.length}\n\n`);
  }
})();
