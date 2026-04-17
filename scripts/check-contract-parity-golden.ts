import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTRACT_PARITY_GOLDEN_CORPUS } from "./contract-parity-golden-corpus";
import {
  buildContractParitySnapshot,
  normalizeContractParitySnapshot,
  stableJsonStringify,
} from "./contract-parity-runtime";

const fixturesRoot = path.join(process.cwd(), "test/_fixtures/contract-parity");

void (async () => {
  let exitCode = 0;

  for (const entry of CONTRACT_PARITY_GOLDEN_CORPUS) {
    const fixturePath = path.join(fixturesRoot, `${entry.label}.json`);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const normalized = normalizeContractParitySnapshot(snapshot, entry.workspace.workspaceRoot);
    const actual = stableJsonStringify(normalized);
    const expected = stableJsonStringify(JSON.parse(readFileSync(fixturePath, "utf8")) as unknown);

    if (actual !== expected) {
      exitCode = 1;
      process.stderr.write(`mismatch ${entry.label}: ${fixturePath}\n`);
      continue;
    }

    process.stdout.write(`ok ${entry.label}\n`);
  }

  process.exitCode = exitCode;
})();
