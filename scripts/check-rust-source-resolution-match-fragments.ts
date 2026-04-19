import path from "node:path";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import {
  assertSourceResolutionMatchFragmentsMatch,
  deriveTsSourceResolutionMatchFragments,
  runShadowSourceResolutionMatchFragmentsInput,
} from "./rust-shadow-shared";

const workspaceRoot = process.cwd();

const TYPE_FACT_BACKED_SOURCE_RESOLUTION_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "literal-union-source-resolution-match",
    contractVersion: "2",
    workspace: {
      workspaceRoot: path.join(
        workspaceRoot,
        "test/_fixtures/type-fact-backend-parity/literal-union",
      ),
      sourceFilePaths: [
        path.join(
          workspaceRoot,
          "test/_fixtures/type-fact-backend-parity/literal-union/src/App.ts",
        ),
      ],
      styleFilePaths: [
        path.join(
          workspaceRoot,
          "test/_fixtures/type-fact-backend-parity/literal-union/src/App.module.scss",
        ),
      ],
    },
    filters: {
      preset: "changed-source",
      category: "source",
      severity: "all",
      includeBundles: ["source-missing"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "path-alias-source-resolution-match",
    contractVersion: "2",
    workspace: {
      workspaceRoot: path.join(workspaceRoot, "test/_fixtures/type-fact-backend-parity/path-alias"),
      sourceFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/type-fact-backend-parity/path-alias/src/App.ts"),
      ],
      styleFilePaths: [
        path.join(
          workspaceRoot,
          "test/_fixtures/type-fact-backend-parity/path-alias/src/App.module.scss",
        ),
      ],
    },
    filters: {
      preset: "changed-source",
      category: "source",
      severity: "all",
      includeBundles: ["source-missing"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
] as const;

void (async () => {
  for (const entry of TYPE_FACT_BACKED_SOURCE_RESOLUTION_CORPUS) {
    process.stdout.write(`== rust-source-resolution-match-fragments:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSourceResolutionMatchFragments(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSourceResolutionMatchFragmentsInput(snapshot.input);

    assertSourceResolutionMatchFragmentsMatch(entry.label, actual, expected);

    process.stdout.write(
      `matched source resolution match fragments: ${actual.fragments.length}\n\n`,
    );
  }
})();
