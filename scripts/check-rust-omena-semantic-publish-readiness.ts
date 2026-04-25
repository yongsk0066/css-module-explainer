import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import { OMENA_SEMANTIC_OBSERVATION_CORPUS } from "./omena-semantic-observation-corpus";
import { runObservationContract } from "./omena-semantic-observation-runtime";

void (async () => {
  let publishReadyCount = 0;
  let publishBlockedCount = 0;
  let observationBacklogCount = 0;

  for (const entry of OMENA_SEMANTIC_OBSERVATION_CORPUS) {
    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry.contract);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const contract = await runObservationContract({
      stylePath: entry.styleFilePath,
      styleSource: readFileSync(entry.styleFilePath, "utf8"),
      engineInput: snapshot.input,
    });

    assert.equal(contract.product, "omena-semantic.theory-observation-contract");
    assert.equal(contract.ready, entry.expected.ready);
    assert.equal(contract.publishReady, entry.expected.publishReady);
    assert.deepEqual(contract.publishBlockingGaps, entry.expected.publishBlockingGaps);
    assert.deepEqual(contract.observationGaps, entry.expected.observationGaps);

    if (contract.publishReady) {
      publishReadyCount += 1;
    } else {
      publishBlockedCount += 1;
    }

    if (contract.publishReady && !contract.ready) {
      observationBacklogCount += 1;
      assert.ok(
        contract.observationGaps.length > 0,
        `${entry.label}: publish-ready backlog cases must preserve observation gaps`,
      );
    }

    process.stdout.write(
      [
        `validated omena-semantic publish readiness: ${entry.label}`,
        `ready=${contract.ready}`,
        `publishReady=${contract.publishReady}`,
        `publishBlockingGaps=${contract.publishBlockingGaps.join(",") || "none"}`,
        `observationGaps=${contract.observationGaps.join(",") || "none"}`,
      ].join(" "),
    );
    process.stdout.write("\n");
  }

  assert.ok(
    observationBacklogCount > 0,
    "expected at least one publish-ready observation backlog case",
  );
  process.stdout.write(
    [
      "validated omena-semantic publish readiness gate:",
      `publishReady=${publishReadyCount}`,
      `publishBlocked=${publishBlockedCount}`,
      `observationBacklog=${observationBacklogCount}`,
    ].join(" "),
  );
  process.stdout.write("\n");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
