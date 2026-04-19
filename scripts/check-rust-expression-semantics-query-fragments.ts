import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertExpressionSemanticsQueryFragmentsMatch,
  deriveTsExpressionSemanticsQueryFragments,
  runShadowExpressionSemanticsQueryFragmentsInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-expression-semantics-query-fragments:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionSemanticsQueryFragments(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionSemanticsQueryFragmentsInput(snapshot.input);

    assertExpressionSemanticsQueryFragmentsMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched expression semantics query fragments: ${actual.fragments.length}\n\n`,
    );
  }
})();
