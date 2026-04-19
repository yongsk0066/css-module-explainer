import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertSourceResolutionQueryFragmentsMatch,
  deriveTsSourceResolutionQueryFragments,
  runShadowSourceResolutionQueryFragmentsInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-source-resolution-query-fragments:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSourceResolutionQueryFragments(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSourceResolutionQueryFragmentsInput(snapshot.input);

    assertSourceResolutionQueryFragmentsMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched source resolution query fragments: ${actual.fragments.length}\n\n`,
    );
  }
})();
