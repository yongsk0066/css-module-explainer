import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertExpressionDomainCandidatesMatch,
  deriveTsExpressionDomainCandidates,
  runShadowExpressionDomainCandidatesInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-expression-domain-candidates:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionDomainCandidates(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionDomainCandidatesInput(snapshot.input);

    assertExpressionDomainCandidatesMatch(entry.label, actual, expected);

    process.stdout.write(`matched expression domain candidates: ${actual.candidates.length}\n\n`);
  }
})();
