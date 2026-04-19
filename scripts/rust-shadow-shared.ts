import { spawn } from "node:child_process";
import path from "node:path";
import type { EngineParitySnapshotV2 } from "../server/engine-host-node/src/engine-parity-v2";

const REPO_ROOT = process.cwd();
const RUST_MANIFEST = path.join(REPO_ROOT, "rust/Cargo.toml");

export interface ShadowSummaryV0 {
  readonly schemaVersion: string;
  readonly inputVersion: string;
  readonly sourceCount: number;
  readonly styleCount: number;
  readonly typeFactCount: number;
  readonly distinctFactFiles: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly constrainedKinds: Readonly<Record<string, number>>;
  readonly finiteValueCount: number;
  readonly queryResultCount: number;
  readonly queryKindCounts: Readonly<Record<string, number>>;
  readonly rewritePlanCount: number;
  readonly checkerWarningCount: number;
  readonly checkerHintCount: number;
  readonly checkerTotalFindings: number;
}

export async function runShadow(snapshot: unknown): Promise<ShadowSummaryV0> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cargo",
      ["run", "--manifest-path", RUST_MANIFEST, "-p", "engine-shadow-runner", "--quiet"],
      {
        cwd: REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [`engine-shadow-runner exited with code ${code}`, stderr.join("").trim()]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout.join("")) as ShadowSummaryV0);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(snapshot));
  });
}

export function deriveTsShadowSummary(snapshot: EngineParitySnapshotV2): ShadowSummaryV0 {
  const byKind: Record<string, number> = {};
  const constrainedKinds: Record<string, number> = {};
  const queryKindCounts: Record<string, number> = {};
  const distinctFactFiles = new Set<string>();
  let finiteValueCount = 0;

  for (const entry of snapshot.input.typeFacts) {
    distinctFactFiles.add(entry.filePath);
    byKind[entry.facts.kind] = (byKind[entry.facts.kind] ?? 0) + 1;

    if (entry.facts.kind === "finiteSet") {
      finiteValueCount += entry.facts.values.length;
    }

    if (entry.facts.kind === "constrained") {
      constrainedKinds[entry.facts.constraintKind] =
        (constrainedKinds[entry.facts.constraintKind] ?? 0) + 1;
    }
  }

  for (const query of snapshot.output.queryResults) {
    queryKindCounts[query.kind] = (queryKindCounts[query.kind] ?? 0) + 1;
  }

  return {
    schemaVersion: "0",
    inputVersion: snapshot.input.version,
    sourceCount: snapshot.input.sources.length,
    styleCount: snapshot.input.styles.length,
    typeFactCount: snapshot.input.typeFacts.length,
    distinctFactFiles: distinctFactFiles.size,
    byKind,
    constrainedKinds,
    finiteValueCount,
    queryResultCount: snapshot.output.queryResults.length,
    queryKindCounts,
    rewritePlanCount: snapshot.output.rewritePlans.length,
    checkerWarningCount: snapshot.output.checkerReport.summary.warnings,
    checkerHintCount: snapshot.output.checkerReport.summary.hints,
    checkerTotalFindings: snapshot.output.checkerReport.summary.total,
  };
}

export function assertShadowSummaryMatch(
  label: string,
  actual: ShadowSummaryV0,
  expected: ShadowSummaryV0,
): void {
  assertEqualField(label, "schemaVersion", actual.schemaVersion, expected.schemaVersion);
  assertEqualField(label, "inputVersion", actual.inputVersion, expected.inputVersion);
  assertEqualField(label, "sourceCount", actual.sourceCount, expected.sourceCount);
  assertEqualField(label, "styleCount", actual.styleCount, expected.styleCount);
  assertEqualField(label, "typeFactCount", actual.typeFactCount, expected.typeFactCount);
  assertEqualField(
    label,
    "distinctFactFiles",
    actual.distinctFactFiles,
    expected.distinctFactFiles,
  );
  assertEqualField(label, "finiteValueCount", actual.finiteValueCount, expected.finiteValueCount);
  assertEqualField(label, "queryResultCount", actual.queryResultCount, expected.queryResultCount);
  assertEqualField(label, "rewritePlanCount", actual.rewritePlanCount, expected.rewritePlanCount);
  assertEqualField(
    label,
    "checkerWarningCount",
    actual.checkerWarningCount,
    expected.checkerWarningCount,
  );
  assertEqualField(label, "checkerHintCount", actual.checkerHintCount, expected.checkerHintCount);
  assertEqualField(
    label,
    "checkerTotalFindings",
    actual.checkerTotalFindings,
    expected.checkerTotalFindings,
  );
  assertRecordEqual(label, "byKind", actual.byKind, expected.byKind);
  assertRecordEqual(label, "constrainedKinds", actual.constrainedKinds, expected.constrainedKinds);
  assertRecordEqual(label, "queryKindCounts", actual.queryKindCounts, expected.queryKindCounts);
}

function assertEqualField<T>(label: string, field: string, actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${JSON.stringify(expected)}\nreceived: ${JSON.stringify(actual)}`,
    );
  }
}

function assertRecordEqual(
  label: string,
  field: string,
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
) {
  const actualJson = JSON.stringify(sortRecord(actual));
  const expectedJson = JSON.stringify(sortRecord(expected));
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: ${field} mismatch\nexpected: ${expectedJson}\nreceived: ${actualJson}`,
    );
  }
}

function sortRecord(record: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));
}
