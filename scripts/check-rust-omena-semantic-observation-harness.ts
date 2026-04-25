import { strict as assert } from "node:assert";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildContractParitySnapshot } from "./contract-parity-runtime";
import { OMENA_SEMANTIC_OBSERVATION_CORPUS } from "./omena-semantic-observation-corpus";

interface TheoryObservationHarnessSummaryV0 {
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

interface TheoryObservationContractV0 {
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

const STYLE_PATH = "/tmp/Component.module.scss";

interface ObservationInput {
  readonly stylePath: string;
  readonly styleSource: string;
  readonly engineInput: unknown;
}

function range(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
  return {
    start: {
      line: startLine,
      character: startCharacter,
    },
    end: {
      line: endLine,
      character: endCharacter,
    },
  };
}

function sampleEngineInput() {
  return {
    version: "2",
    sources: [
      {
        document: {
          classExpressions: [
            {
              id: "expr-button",
              kind: "literal",
              scssModulePath: STYLE_PATH,
              range: range(4, 12, 4, 18),
              className: "button",
              rootBindingDeclId: null,
              accessPath: null,
            },
            {
              id: "expr-primary",
              kind: "symbolRef",
              scssModulePath: STYLE_PATH,
              range: range(5, 12, 5, 24),
              className: null,
              rootBindingDeclId: "decl-primary",
              accessPath: null,
            },
          ],
        },
      },
    ],
    styles: [
      {
        filePath: STYLE_PATH,
        document: {
          selectors: [
            {
              name: "button",
              viewKind: "canonical",
              canonicalName: "button",
              range: range(0, 1, 0, 7),
              nestedSafety: "flat",
              composes: null,
              bemSuffix: null,
            },
            {
              name: "button--primary",
              viewKind: "canonical",
              canonicalName: "button--primary",
              range: range(1, 1, 1, 17),
              nestedSafety: "flat",
              composes: null,
              bemSuffix: null,
            },
          ],
        },
      },
    ],
    typeFacts: [
      {
        filePath: "/tmp/Component.tsx",
        expressionId: "expr-button",
        facts: {
          kind: "exact",
          constraintKind: null,
          values: ["button"],
          prefix: null,
          suffix: null,
          minLen: null,
          maxLen: null,
          charMust: null,
          charMay: null,
          mayIncludeOtherChars: null,
        },
      },
      {
        filePath: "/tmp/Component.tsx",
        expressionId: "expr-primary",
        facts: {
          kind: "constrained",
          constraintKind: "prefix",
          values: null,
          prefix: "button--",
          suffix: null,
          minLen: null,
          maxLen: null,
          charMust: null,
          charMay: null,
          mayIncludeOtherChars: null,
        },
      },
    ],
  };
}

async function runObservation(
  inputValue: ObservationInput,
): Promise<TheoryObservationHarnessSummaryV0> {
  return runOmenaSemanticJson<TheoryObservationHarnessSummaryV0>(
    "omena-semantic-observation",
    inputValue,
  );
}

async function runObservationContract(
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

async function runSyntheticObservation(
  styleSource: string,
): Promise<TheoryObservationHarnessSummaryV0> {
  return runObservation({
    stylePath: STYLE_PATH,
    styleSource,
    engineInput: sampleEngineInput(),
  });
}

void (async () => {
  execFileSync(
    "cargo",
    [
      "test",
      "--manifest-path",
      "rust/Cargo.toml",
      "-p",
      "omena-semantic",
      "theory_observation_harness",
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
    },
  );

  const ready = await runSyntheticObservation(".button { &__icon { color: red; } }");
  assert.equal(ready.product, "omena-semantic.theory-observation-harness");
  assert.equal(ready.selectorIdentity.status, "ready");
  assert.equal(ready.selectorIdentity.renameSafe, true);
  assert.equal(ready.sourceEvidence.status, "ready");
  assert.equal(ready.downstreamReadiness.status, "ready");
  assert.deepEqual(ready.blockingGaps, []);
  assert.deepEqual(ready.nextPriorities, ["externalCorpus", "traitDogfooding"]);
  process.stdout.write(
    `validated omena-semantic observation harness: ready selectors=${ready.selectorIdentity.observedSelectorCount} sourceExpressions=${ready.sourceEvidence.expressionCount}\n`,
  );

  const blocked = await runSyntheticObservation(".button { &.active { color: red; } }");
  assert.equal(blocked.selectorIdentity.status, "partial");
  assert.equal(blocked.selectorIdentity.rewriteBlockedSelectorCount, 1);
  assert.equal(blocked.downstreamReadiness.status, "partial");
  assert.deepEqual(blocked.blockingGaps, ["selectorRewriteSafety", "downstreamReadiness"]);
  process.stdout.write(
    `validated omena-semantic observation harness: blocked selectors=${blocked.selectorIdentity.rewriteBlockedSelectorCount} gaps=${blocked.blockingGaps.join(",")}\n`,
  );

  for (const entry of OMENA_SEMANTIC_OBSERVATION_CORPUS) {
    process.stdout.write(`== omena-semantic-observation-corpus:${entry.label} ==\n`);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry.contract);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runObservation({
      stylePath: entry.styleFilePath,
      styleSource: readFileSync(entry.styleFilePath, "utf8"),
      engineInput: snapshot.input,
    });
    // oxlint-disable-next-line eslint/no-await-in-loop
    const contract = await runObservationContract({
      stylePath: entry.styleFilePath,
      styleSource: readFileSync(entry.styleFilePath, "utf8"),
      engineInput: snapshot.input,
    });

    assert.equal(actual.product, "omena-semantic.theory-observation-harness");
    assert.equal(actual.graphProduct, "omena-semantic.style-semantic-graph");
    assert.equal(actual.selectorIdentity.status, entry.expected.selectorIdentityStatus);
    assert.equal(actual.sourceEvidence.status, entry.expected.sourceEvidenceStatus);
    assert.equal(actual.downstreamReadiness.status, entry.expected.downstreamReadinessStatus);
    assert.ok(
      actual.selectorIdentity.observedSelectorCount >= entry.expected.minSelectorCount,
      `${entry.label}: expected at least ${entry.expected.minSelectorCount} selectors, got ${actual.selectorIdentity.observedSelectorCount}`,
    );
    assert.ok(
      actual.sourceEvidence.expressionCount >= entry.expected.minExpressionCount,
      `${entry.label}: expected at least ${entry.expected.minExpressionCount} expressions, got ${actual.sourceEvidence.expressionCount}`,
    );
    assert.equal(actual.sourceEvidence.cmeCoupled, true);
    assert.equal(actual.couplingBoundary.cmeCoupledObservationCount, 2);
    assert.equal(actual.couplingBoundary.splitRecommendation, "keep-integrated-observe-boundary");
    assert.equal(contract.product, "omena-semantic.theory-observation-contract");
    assert.equal(contract.observationProduct, actual.product);
    assert.equal(contract.ready, entry.expected.ready);
    assert.equal(contract.publishReady, entry.expected.publishReady);
    assert.deepEqual(contract.publishBlockingGaps, entry.expected.publishBlockingGaps);
    assert.deepEqual(contract.observationGaps, entry.expected.observationGaps);
    assert.equal(contract.selectorIdentityStatus, actual.selectorIdentity.status);
    assert.equal(contract.sourceEvidenceStatus, actual.sourceEvidence.status);
    assert.equal(contract.downstreamReadinessStatus, actual.downstreamReadiness.status);
    process.stdout.write(
      [
        "validated external observation corpus:",
        `selectors=${actual.selectorIdentity.observedSelectorCount}`,
        `expressions=${actual.sourceEvidence.expressionCount}`,
        `status=${actual.downstreamReadiness.status}`,
        `publishReady=${contract.publishReady}`,
      ].join(" "),
    );
    process.stdout.write("\n\n");
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
