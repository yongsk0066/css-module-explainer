import path from "node:path";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import {
  assertSourceResolutionCanonicalProducerSignalMatch,
  deriveTsSourceResolutionCanonicalProducerSignal,
  runShadowSourceResolutionCanonicalProducerInput,
} from "./rust-shadow-shared";

const workspaceRoot = process.cwd();

const SOURCE_RESOLUTION_CANONICAL_PRODUCER_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "literal-union-source-resolution-canonical-producer",
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
    label: "path-alias-source-resolution-canonical-producer",
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
  {
    label: "composite-source-resolution-canonical-producer",
    contractVersion: "2",
    workspace: {
      workspaceRoot: path.join(workspaceRoot, "test/_fixtures/type-fact-backend-parity/composite"),
      sourceFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/type-fact-backend-parity/composite/src/App.ts"),
      ],
      styleFilePaths: [
        path.join(
          workspaceRoot,
          "test/_fixtures/type-fact-backend-parity/composite/src/App.module.scss",
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
  for (const entry of SOURCE_RESOLUTION_CANONICAL_PRODUCER_CORPUS) {
    process.stdout.write(`== rust-source-resolution-canonical-producer:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSourceResolutionCanonicalProducerSignal(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSourceResolutionCanonicalProducerInput(snapshot.input);

    assertSourceResolutionCanonicalProducerSignalMatch(entry.label, actual, expected);

    process.stdout.write(
      [
        "validated source resolution canonical-producer signal:",
        `queries=${actual.canonicalBundle.queryFragments.length}`,
        `fragments=${actual.canonicalBundle.fragments.length}`,
        `matches=${actual.canonicalBundle.matchFragments.length}`,
        `candidates=${actual.canonicalBundle.candidates.length}`,
        `evaluator=${actual.evaluatorCandidates.results.length}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})();
