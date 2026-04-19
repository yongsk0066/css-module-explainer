import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertExpressionDomainCanonicalCandidateBundleMatch,
  deriveTsExpressionDomainCanonicalCandidateBundle,
  runShadowExpressionDomainCanonicalCandidateInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-expression-domain-canonical-candidate:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionDomainCanonicalCandidateBundle(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionDomainCanonicalCandidateInput(snapshot.input);

    assertExpressionDomainCanonicalCandidateBundleMatch(entry.label, actual, expected);

    process.stdout.write(
      [
        "validated expression domain canonical-candidate bundle:",
        `planned=${actual.planSummary.plannedExpressionIds.length}`,
        `fragments=${actual.fragments.length}`,
        `candidates=${actual.candidates.length}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})();
