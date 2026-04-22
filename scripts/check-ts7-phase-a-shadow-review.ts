import { execFileSync } from "node:child_process";

type Run = {
  readonly workflowName: string;
  readonly status: string;
  readonly conclusion: string;
  readonly databaseId: number;
  readonly headSha: string;
  readonly url: string;
};

const REPO_ROOT = process.cwd();
const SHADOW_WORKFLOW_NAME = "TS7 Phase A Shadow" as const;
const MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_PHASE_A_DECISION = 3 as const;

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
  const runs = loadShadowRuns();
  const completedRuns = runs.filter((run) => run.status === "completed");
  const recentCompletedRuns = completedRuns.slice(
    0,
    MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_PHASE_A_DECISION,
  );
  const successfulRecentRuns = recentCompletedRuns.filter(
    (run) => run.conclusion === "success",
  ).length;
  const inProgressRuns = runs.filter((run) => run.status !== "completed").length;
  const readyForPhaseADecision =
    recentCompletedRuns.length >= MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_PHASE_A_DECISION &&
    successfulRecentRuns === MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_PHASE_A_DECISION;

  process.stdout.write(
    [
      "== ts7-phase-a-shadow-review ==",
      `workflow=${SHADOW_WORKFLOW_NAME}`,
      `minimumSuccessfulShadowRuns=${MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_PHASE_A_DECISION}`,
      `completedRunsObserved=${completedRuns.length}`,
      `recentCompletedRunsObserved=${recentCompletedRuns.length}`,
      `recentSuccessfulRuns=${successfulRecentRuns}`,
      `inProgressRuns=${inProgressRuns}`,
      `readyForPhaseADecision=${readyForPhaseADecision}`,
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
