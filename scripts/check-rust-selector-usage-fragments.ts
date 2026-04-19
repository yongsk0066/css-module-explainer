import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertSelectorUsageFragmentsMatch,
  deriveTsSelectorUsageFragments,
  runShadowSelectorUsageFragmentsInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-selector-usage-fragments:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSelectorUsageFragments(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSelectorUsageFragmentsInput(snapshot.input);

    assertSelectorUsageFragmentsMatch(entry.label, actual, expected);

    process.stdout.write(`matched selector usage fragments: ${actual.fragments.length}\n\n`);
  }
})();
