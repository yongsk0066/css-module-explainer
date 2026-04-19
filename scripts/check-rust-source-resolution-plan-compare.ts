import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  assertSourceResolutionPlanSummaryMatch,
  deriveTsSourceResolutionPlanSummary,
  runShadowSourceResolutionPlanInput,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-source-resolution-plan-compare:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSourceResolutionPlanSummary(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSourceResolutionPlanInput(snapshot.input);

    assertSourceResolutionPlanSummaryMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched source resolution plan: expressions=${actual.plannedExpressionIds.length} styles=${actual.distinctStyleFilePaths.length} styleAccess=${actual.styleAccessCount}\n\n`,
    );
  }
})();
