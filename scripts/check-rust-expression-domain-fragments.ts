import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertExpressionDomainFragmentsMatch,
  deriveTsExpressionDomainFragments,
  runShadowExpressionDomainFragmentsInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-expression-domain-fragments:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionDomainFragments(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionDomainFragmentsInput(snapshot.input);

    assertExpressionDomainFragmentsMatch(entry.label, actual, expected);

    process.stdout.write(`matched expression domain fragments: ${actual.fragments.length}\n\n`);
  }
})();
