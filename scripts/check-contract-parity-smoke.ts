import { CONTRACT_PARITY_CORPUS } from "./contract-parity-corpus";
import { buildContractParitySnapshot } from "./contract-parity-runtime";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS) {
    process.stdout.write(`== ${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);

    process.stdout.write(
      `input: ${snapshot.input.sources.length} sources, ${snapshot.input.styles.length} styles, ${snapshot.input.typeFacts.length} type facts\n`,
    );
    process.stdout.write(
      `output: ${snapshot.output.queryResults.length} query results, ${snapshot.output.checkerReport.summary.total} findings\n\n`,
    );
  }
})();
