import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONTRACT_PARITY_GOLDEN_CORPUS } from "./contract-parity-golden-corpus";
import {
  buildContractParitySnapshot,
  normalizeContractParitySnapshot,
  stableJsonStringify,
} from "./contract-parity-runtime";

const fixturesRoot = path.join(process.cwd(), "test/_fixtures/contract-parity");

void (async () => {
  mkdirSync(fixturesRoot, { recursive: true });
  const writtenFixturePaths: string[] = [];

  for (const entry of CONTRACT_PARITY_GOLDEN_CORPUS) {
    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const normalized = normalizeContractParitySnapshot(snapshot, entry.workspace.workspaceRoot);
    const fixturePath = path.join(fixturesRoot, `${entry.label}.json`);
    writeFileSync(fixturePath, stableJsonStringify(normalized), "utf8");
    writtenFixturePaths.push(fixturePath);
    process.stdout.write(`updated ${entry.label}\n`);
  }

  execFileSync("pnpm", ["exec", "oxfmt", ...writtenFixturePaths], {
    stdio: "inherit",
  });
})();
