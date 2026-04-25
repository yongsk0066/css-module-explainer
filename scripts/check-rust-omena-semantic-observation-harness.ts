import { strict as assert } from "node:assert";
import { execFileSync, spawn } from "node:child_process";

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

const STYLE_PATH = "/tmp/Component.module.scss";

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

async function runObservation(styleSource: string): Promise<TheoryObservationHarnessSummaryV0> {
  const input = JSON.stringify({
    stylePath: STYLE_PATH,
    styleSource,
    engineInput: sampleEngineInput(),
  });

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
        "omena-semantic-observation",
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
        reject(new Error(`omena-semantic-observation exited with ${code}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout) as TheoryObservationHarnessSummaryV0);
    });

    child.stdin.end(input);
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

  const ready = await runObservation(".button { &__icon { color: red; } }");
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

  const blocked = await runObservation(".button { &.active { color: red; } }");
  assert.equal(blocked.selectorIdentity.status, "partial");
  assert.equal(blocked.selectorIdentity.rewriteBlockedSelectorCount, 1);
  assert.equal(blocked.downstreamReadiness.status, "partial");
  assert.deepEqual(blocked.blockingGaps, ["selectorRewriteSafety", "downstreamReadiness"]);
  process.stdout.write(
    `validated omena-semantic observation harness: blocked selectors=${blocked.selectorIdentity.rewriteBlockedSelectorCount} gaps=${blocked.blockingGaps.join(",")}\n`,
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
