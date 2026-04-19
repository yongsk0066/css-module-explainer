import path from "node:path";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import {
  assertSourceSideCanonicalProducerSignalMatch,
  deriveTsSourceSideCanonicalProducerSignal,
  runShadowSourceSideCanonicalProducerInput,
} from "./rust-shadow-shared";

const workspaceRoot = process.cwd();

const SOURCE_SIDE_CANONICAL_PRODUCER_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "literal-union-source-side-canonical-producer",
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
    label: "path-alias-source-side-canonical-producer",
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
    label: "composite-source-side-canonical-producer",
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
  for (const entry of SOURCE_SIDE_CANONICAL_PRODUCER_CORPUS) {
    process.stdout.write(`== rust-source-side-canonical-producer:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSourceSideCanonicalProducerSignal(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSourceSideCanonicalProducerInput(snapshot.input);

    assertSourceSideCanonicalProducerSignalMatch(entry.label, actual, expected);

    process.stdout.write(
      [
        "validated source-side canonical-producer signal:",
        `expressionCandidates=${actual.expressionSemantics.canonicalBundle.candidates.length}`,
        `expressionEvaluator=${actual.expressionSemantics.evaluatorCandidates.results.length}`,
        `resolutionCandidates=${actual.sourceResolution.canonicalBundle.candidates.length}`,
        `resolutionEvaluator=${actual.sourceResolution.evaluatorCandidates.results.length}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})();
