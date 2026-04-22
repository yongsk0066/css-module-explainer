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
const SHADOW_WORKFLOW_NAME = "TSGO Operational Shadow" as const;
const MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_OPERATIONAL_DECISION = 3 as const;

function loadShadowRuns() {
  let output: string;
  try {
    output = execFileSync(
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
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.includes(`could not find any workflows named ${SHADOW_WORKFLOW_NAME}`)
    ) {
      return [];
    }
    throw error;
  }

  return JSON.parse(output) as readonly Run[];
}

void (async () => {
  const runs = loadShadowRuns();
  const completedRuns = runs.filter((run) => run.status === "completed");
  const recentCompletedRuns = completedRuns.slice(
    0,
    MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_OPERATIONAL_DECISION,
  );
  const successfulRecentRuns = recentCompletedRuns.filter(
    (run) => run.conclusion === "success",
  ).length;
  const inProgressRuns = runs.filter((run) => run.status !== "completed").length;
  const readyForOperationalDefaultDecision =
    recentCompletedRuns.length >= MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_OPERATIONAL_DECISION &&
    successfulRecentRuns === MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_OPERATIONAL_DECISION;

  process.stdout.write(
    [
      "== tsgo-operational-shadow-review ==",
      `workflow=${SHADOW_WORKFLOW_NAME}`,
      `minimumSuccessfulShadowRuns=${MINIMUM_SUCCESSFUL_SHADOW_RUNS_FOR_OPERATIONAL_DECISION}`,
      `completedRunsObserved=${completedRuns.length}`,
      `recentCompletedRunsObserved=${recentCompletedRuns.length}`,
      `recentSuccessfulRuns=${successfulRecentRuns}`,
      `inProgressRuns=${inProgressRuns}`,
      `readyForOperationalDefaultDecision=${readyForOperationalDefaultDecision}`,
      "",
    ].join("\n"),
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
