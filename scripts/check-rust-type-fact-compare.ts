import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  deriveTsTypeFactInputSummary,
  runShadowTypeFactInput,
  type TypeFactInputSummaryV0,
} from "./rust-shadow-shared";

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-type-fact-compare:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsTypeFactInputSummary(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowTypeFactInput(snapshot.input);

    assertTypeFactSummaryMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched type-fact fields: count=${actual.typeFactCount} distinctFiles=${actual.distinctFactFiles} finiteValues=${actual.finiteValueCount} kinds=${JSON.stringify(actual.byKind)}\n\n`,
    );
  }
})();

function assertTypeFactSummaryMatch(
  label: string,
  actual: TypeFactInputSummaryV0,
  expected: TypeFactInputSummaryV0,
) {
  assertEqual(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqual(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqual(label, "typeFactCount", actual.typeFactCount, expected.typeFactCount);
  assertEqual(label, "distinctFactFiles", actual.distinctFactFiles, expected.distinctFactFiles);
  assertEqual(label, "finiteValueCount", actual.finiteValueCount, expected.finiteValueCount);
  assertJsonEqual(label, "byKind", actual.byKind, expected.byKind);
  assertJsonEqual(label, "constrainedKinds", actual.constrainedKinds, expected.constrainedKinds);
}

function assertEqual<T>(label: string, field: string, actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${JSON.stringify(expected)}\nreceived: ${JSON.stringify(actual)}`,
    );
  }
}

function assertJsonEqual(label: string, field: string, actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}
