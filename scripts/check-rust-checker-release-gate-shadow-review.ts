import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";
import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus-v1";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import {
  runShadowCheckerSourceMissingCanonicalProducer,
  runShadowCheckerStyleRecoveryCanonicalProducer,
} from "./rust-shadow-shared";

type Run = {
  readonly workflowName: string;
  readonly status: string;
  readonly conclusion: string;
  readonly databaseId: number;
  readonly headSha: string;
  readonly url: string;
};

const REPO_ROOT = process.cwd();
const STYLELINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/stylelint-plugin-smoke");
const ESLINT_SMOKE_ROOT = path.join(REPO_ROOT, "test/_fixtures/eslint-plugin-smoke");
const SHADOW_WORKFLOW_NAME = "Checker Release Gate Shadow" as const;
const MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_RELEASE_ENFORCEMENT = 3 as const;

const STYLE_RECOVERY_ENTRY: ContractParityEntry = {
  label: "release-gate-shadow-review-style-recovery",
  workspace: {
    workspaceRoot: STYLELINT_SMOKE_ROOT,
    sourceFilePaths: [],
    styleFilePaths: [path.join(STYLELINT_SMOKE_ROOT, "src/ComposesMissingModule.module.css")],
  },
  filters: {
    preset: "changed-style",
    category: "style",
    severity: "all",
    includeBundles: ["style-recovery"],
    includeCodes: [],
    excludeCodes: [],
  },
};

const SOURCE_MISSING_ENTRY: ContractParityEntry = {
  label: "release-gate-shadow-review-source-missing",
  workspace: {
    workspaceRoot: ESLINT_SMOKE_ROOT,
    sourceFilePaths: [path.join(ESLINT_SMOKE_ROOT, "src/MissingModule.jsx")],
    styleFilePaths: [],
  },
  filters: {
    preset: "changed-source",
    category: "source",
    severity: "all",
    includeBundles: ["source-missing"],
    includeCodes: [],
    excludeCodes: [],
  },
};

function loadShadowRuns() {
  const output = execFileSync(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      SHADOW_WORKFLOW_NAME,
      "--branch",
      "master",
      "--limit",
      "20",
      "--json",
      "workflowName,status,conclusion,databaseId,headSha,url",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  return JSON.parse(output) as readonly Run[];
}

void (async () => {
  const styleSnapshot = await buildContractParitySnapshot(STYLE_RECOVERY_ENTRY);
  const sourceSnapshot = await buildContractParitySnapshot(SOURCE_MISSING_ENTRY);

  const styleProducer = await runShadowCheckerStyleRecoveryCanonicalProducer(styleSnapshot);
  const sourceProducer = await runShadowCheckerSourceMissingCanonicalProducer(sourceSnapshot);

  assert.equal(
    styleProducer.boundedCheckerGate.releaseGateShadowReviewCommand,
    "pnpm check:rust-checker-release-gate-shadow-review",
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.releaseGateShadowReviewCommand,
    "pnpm check:rust-checker-release-gate-shadow-review",
  );
  assert.equal(
    styleProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle,
    MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_RELEASE_ENFORCEMENT,
  );
  assert.equal(
    sourceProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle,
    MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_RELEASE_ENFORCEMENT,
  );

  const runs = loadShadowRuns();
  const completedRuns = runs.filter((run) => run.status === "completed");
  const recentCompletedRuns = completedRuns.slice(
    0,
    MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_RELEASE_ENFORCEMENT,
  );
  const successfulRecentRuns = recentCompletedRuns.filter(
    (run) => run.conclusion === "success",
  ).length;
  const inProgressRuns = runs.filter((run) => run.status !== "completed").length;
  const readyForReleaseEnforcement =
    recentCompletedRuns.length >= MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_RELEASE_ENFORCEMENT &&
    successfulRecentRuns === MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_RELEASE_ENFORCEMENT;

  process.stdout.write(
    [
      "== rust-checker-release-gate-shadow-review ==",
      `workflow=${SHADOW_WORKFLOW_NAME}`,
      `shadowReviewCommand=${styleProducer.boundedCheckerGate.releaseGateShadowReviewCommand}`,
      `minimumSuccessfulShadowRuns=${styleProducer.boundedCheckerGate.minimumSuccessfulShadowRunsForRustReleaseBundle}`,
      `completedRunsObserved=${completedRuns.length}`,
      `recentCompletedRunsObserved=${recentCompletedRuns.length}`,
      `recentSuccessfulRuns=${successfulRecentRuns}`,
      `inProgressRuns=${inProgressRuns}`,
      `readyForReleaseEnforcement=${readyForReleaseEnforcement}`,
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
