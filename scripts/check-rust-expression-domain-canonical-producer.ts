import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertExpressionDomainCanonicalProducerSignalMatch,
  deriveTsExpressionDomainCanonicalProducerSignal,
  runShadowExpressionDomainCanonicalProducerInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-expression-domain-canonical-producer:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionDomainCanonicalProducerSignal(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionDomainCanonicalProducerInput(snapshot.input);

    assertExpressionDomainCanonicalProducerSignalMatch(entry.label, actual, expected);

    process.stdout.write(
      [
        "validated expression domain canonical-producer signal:",
        `planned=${actual.canonicalBundle.planSummary.plannedExpressionIds.length}`,
        `fragments=${actual.canonicalBundle.fragments.length}`,
        `candidates=${actual.canonicalBundle.candidates.length}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})();
