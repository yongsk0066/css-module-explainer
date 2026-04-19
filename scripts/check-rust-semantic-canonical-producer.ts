import path from "node:path";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import {
  assertSemanticCanonicalProducerSignalMatch,
  deriveTsSemanticCanonicalProducerSignal,
  runShadowSemanticCanonicalProducerInput,
} from "./rust-shadow-shared";

const workspaceRoot = process.cwd();

const SEMANTIC_CANONICAL_PRODUCER_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "literal-union-semantic-canonical-producer",
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
    label: "path-alias-semantic-canonical-producer",
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
    label: "composite-semantic-canonical-producer",
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
  for (const entry of SEMANTIC_CANONICAL_PRODUCER_CORPUS) {
    process.stdout.write(`== rust-semantic-canonical-producer:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSemanticCanonicalProducerSignal(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSemanticCanonicalProducerInput(snapshot.input);

    assertSemanticCanonicalProducerSignalMatch(entry.label, actual, expected);

    process.stdout.write(
      [
        "validated semantic canonical-producer signal:",
        `expressionCandidates=${actual.canonicalBundle.sourceSide.expressionSemantics.candidates.length}`,
        `resolutionCandidates=${actual.canonicalBundle.sourceSide.sourceResolution.candidates.length}`,
        `domainCandidates=${actual.canonicalBundle.expressionDomain.candidates.length}`,
        `expressionEvaluator=${actual.evaluatorCandidates.sourceSide.expressionSemantics.results.length}`,
        `resolutionEvaluator=${actual.evaluatorCandidates.sourceSide.sourceResolution.results.length}`,
        `domainEvaluator=${actual.evaluatorCandidates.expressionDomain.results.length}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})();
