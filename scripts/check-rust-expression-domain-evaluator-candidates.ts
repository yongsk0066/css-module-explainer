import path from "node:path";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import {
  deriveTsExpressionDomainEvaluatorCandidates,
  runShadowExpressionDomainEvaluatorCandidatesInput,
} from "./rust-shadow-shared";

const workspaceRoot = process.cwd();

const TYPE_FACT_BACKED_EXPRESSION_DOMAIN_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "literal-union-expression-domain",
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
    label: "path-alias-expression-domain",
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
  for (const entry of TYPE_FACT_BACKED_EXPRESSION_DOMAIN_CORPUS) {
    process.stdout.write(`== rust-expression-domain-evaluator-candidates:${entry.label} ==\n`);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    const expected = deriveTsExpressionDomainEvaluatorCandidates(snapshot);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runShadowExpressionDomainEvaluatorCandidatesInput(snapshot.input);

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        [
          `${entry.label}: expression-domain evaluator candidates mismatch`,
          `actual=${JSON.stringify(actual, null, 2)}`,
          `expected=${JSON.stringify(expected, null, 2)}`,
        ].join("\n"),
      );
    }

    process.stdout.write(
      `matched expression domain evaluator candidates: ${actual.results.length}\n\n`,
    );
  }
})();
