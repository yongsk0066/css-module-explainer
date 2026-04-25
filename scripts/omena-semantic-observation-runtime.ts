import { spawn } from "node:child_process";

export interface TheoryObservationHarnessSummaryV0 {
  readonly schemaVersion: "0";
  readonly product: "omena-semantic.theory-observation-harness";
  readonly graphProduct: "omena-semantic.style-semantic-graph";
  readonly selectorIdentity: {
    readonly status: "ready" | "partial" | "gap";
    readonly observedSelectorCount: number;
    readonly renameSafeSelectorCount: number;
    readonly rewriteBlockedSelectorCount: number;
    readonly preciseRenameSpanReady: boolean;
    readonly renameSafe: boolean;
    readonly blockers: readonly string[];
  };
  readonly sourceEvidence: {
    readonly status: "ready" | "partial" | "gap";
    readonly referenceSiteCount: number;
    readonly editableDirectSiteCount: number;
    readonly expressionCount: number;
    readonly explainableCertaintyReasonCount: number;
    readonly missingCertaintyReasonCount: number;
    readonly certaintyReasonCounts: Record<string, number>;
    readonly cmeCoupled: boolean;
  };
  readonly downstreamReadiness: {
    readonly status: "ready" | "partial" | "gap";
    readonly semanticGraphReady: boolean;
    readonly downstreamCheckReady: boolean;
    readonly preciseRenameReady: boolean;
    readonly formatterReady: boolean;
    readonly recoveryDiagnosticsObserved: boolean;
    readonly blockingGapCount: number;
  };
  readonly couplingBoundary: {
    readonly status: "ready" | "partial" | "gap";
    readonly genericObservationCount: number;
    readonly cmeCoupledObservationCount: number;
    readonly genericSurfaces: readonly string[];
    readonly cmeCoupledSurfaces: readonly string[];
    readonly splitRecommendation: string;
  };
  readonly blockingGaps: readonly string[];
  readonly nextPriorities: readonly string[];
}

export interface TheoryObservationContractV0 {
  readonly schemaVersion: "0";
  readonly product: "omena-semantic.theory-observation-contract";
  readonly observationProduct: "omena-semantic.theory-observation-harness";
  readonly ready: boolean;
  readonly publishReady: boolean;
  readonly selectorIdentityStatus: "ready" | "partial" | "gap";
  readonly sourceEvidenceStatus: "ready" | "partial" | "gap";
  readonly downstreamReadinessStatus: "ready" | "partial" | "gap";
  readonly genericObservationCount: number;
  readonly cmeCoupledObservationCount: number;
  readonly blockingGaps: readonly string[];
  readonly publishBlockingGaps: readonly string[];
  readonly observationGaps: readonly string[];
  readonly nextPriorities: readonly string[];
}

export interface ObservationInput {
  readonly stylePath: string;
  readonly styleSource: string;
  readonly engineInput: unknown;
}

export async function runObservation(
  inputValue: ObservationInput,
): Promise<TheoryObservationHarnessSummaryV0> {
  return runOmenaSemanticJson<TheoryObservationHarnessSummaryV0>(
    "omena-semantic-observation",
    inputValue,
  );
}

export async function runObservationContract(
  inputValue: ObservationInput,
): Promise<TheoryObservationContractV0> {
  return runOmenaSemanticJson<TheoryObservationContractV0>(
    "omena-semantic-observation-contract",
    inputValue,
  );
}

async function runOmenaSemanticJson<T>(bin: string, inputValue: ObservationInput): Promise<T> {
  const input = JSON.stringify(inputValue);
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cargo",
      [
        "run",
        "--quiet",
        "--manifest-path",
        "rust/Cargo.toml",
        "-p",
        "omena-semantic",
        "--bin",
        bin,
      ],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${bin} exited with ${code}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout) as T);
    });

    child.stdin.end(input);
  });
}
