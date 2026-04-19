import path from "node:path";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import {
  assertExpressionSemanticsCanonicalCandidateBundleMatch,
  deriveTsExpressionSemanticsCanonicalCandidateBundle,
  runShadowExpressionSemanticsCanonicalCandidateInput,
} from "./rust-shadow-shared";

const workspaceRoot = process.cwd();

const EXPRESSION_SEMANTICS_CANONICAL_CANDIDATE_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "literal-union-expression-semantics-canonical-candidate",
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
    label: "path-alias-expression-semantics-canonical-candidate",
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
    label: "composite-expression-semantics-canonical-candidate",
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
  for (const entry of EXPRESSION_SEMANTICS_CANONICAL_CANDIDATE_CORPUS) {
    process.stdout.write(`== rust-expression-semantics-canonical-candidate:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionSemanticsCanonicalCandidateBundle(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionSemanticsCanonicalCandidateInput(snapshot.input);

    assertExpressionSemanticsCanonicalCandidateBundleMatch(entry.label, actual, expected);

    process.stdout.write(
      [
        "validated expression semantics canonical-candidate bundle:",
        `queries=${actual.queryFragments.length}`,
        `fragments=${actual.fragments.length}`,
        `matches=${actual.matchFragments.length}`,
        `candidates=${actual.candidates.length}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})();
