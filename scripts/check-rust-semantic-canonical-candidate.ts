import path from "node:path";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import {
  assertSemanticCanonicalCandidateBundleMatch,
  deriveTsSemanticCanonicalCandidateBundle,
  runShadowSemanticCanonicalCandidateInput,
} from "./rust-shadow-shared";

const workspaceRoot = process.cwd();

const SEMANTIC_CANONICAL_CANDIDATE_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "literal-union-semantic-canonical-candidate",
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
    label: "path-alias-semantic-canonical-candidate",
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
    label: "composite-semantic-canonical-candidate",
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
  for (const entry of SEMANTIC_CANONICAL_CANDIDATE_CORPUS) {
    process.stdout.write(`== rust-semantic-canonical-candidate:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsSemanticCanonicalCandidateBundle(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowSemanticCanonicalCandidateInput(snapshot.input);

    assertSemanticCanonicalCandidateBundleMatch(entry.label, actual, expected);

    process.stdout.write(
      [
        "validated semantic canonical-candidate bundle:",
        `expressionCandidates=${actual.sourceSide.expressionSemantics.candidates.length}`,
        `resolutionCandidates=${actual.sourceSide.sourceResolution.candidates.length}`,
        `domainCandidates=${actual.expressionDomain.candidates.length}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})();
