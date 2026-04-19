import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import { assertShadowSummaryMatch, deriveTsShadowSummary, runShadow } from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-shadow-compare:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsShadowSummary(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadow(snapshot);

    assertShadowSummaryMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched summary fields: sources=${actual.sourceCount} styles=${actual.styleCount} typeFacts=${actual.typeFactCount} queries=${actual.queryResultCount} findings=${actual.checkerTotalFindings}\n\n`,
    );
  }
})();
