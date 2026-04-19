import { spawn } from "node:child_process";
import path from "node:path";
import { CONTRACT_PARITY_CORPUS_V2 } from "./contract-parity-corpus-v2";
import { buildContractParitySnapshot } from "./contract-parity-runtime";

const REPO_ROOT = process.cwd();
const RUST_MANIFEST = path.join(REPO_ROOT, "rust/Cargo.toml");

void (async () => {
  for (const entry of CONTRACT_PARITY_CORPUS_V2) {
    process.stdout.write(`== rust-shadow:${entry.label} ==\n`);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const snapshot = await buildContractParitySnapshot(entry);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const summary = await runShadow(snapshot);

    if (summary.inputVersion !== "2") {
      throw new Error(`Unexpected inputVersion for ${entry.label}: ${summary.inputVersion}`);
    }
    if (summary.sourceCount !== snapshot.input.sources.length) {
      throw new Error(`Source count mismatch for ${entry.label}`);
    }
    if (summary.styleCount !== snapshot.input.styles.length) {
      throw new Error(`Style count mismatch for ${entry.label}`);
    }
    if (summary.typeFactCount !== snapshot.input.typeFacts.length) {
      throw new Error(`Type fact count mismatch for ${entry.label}`);
    }
    if (summary.queryResultCount !== snapshot.output.queryResults.length) {
      throw new Error(`Query result count mismatch for ${entry.label}`);
    }
    if (summary.rewritePlanCount !== snapshot.output.rewritePlans.length) {
      throw new Error(`Rewrite plan count mismatch for ${entry.label}`);
    }
    if (summary.checkerTotalFindings !== snapshot.output.checkerReport.summary.total) {
      throw new Error(`Checker total mismatch for ${entry.label}`);
    }
    if (summary.checkerWarningCount !== snapshot.output.checkerReport.summary.warnings) {
      throw new Error(`Checker warning mismatch for ${entry.label}`);
    }
    if (summary.checkerHintCount !== snapshot.output.checkerReport.summary.hints) {
      throw new Error(`Checker hint mismatch for ${entry.label}`);
    }

    process.stdout.write(
      `sources=${summary.sourceCount} styles=${summary.styleCount} typeFacts=${summary.typeFactCount} queries=${summary.queryResultCount} findings=${summary.checkerTotalFindings} kinds=${JSON.stringify(summary.byKind)} queryKinds=${JSON.stringify(summary.queryKindCounts)}\n\n`,
    );
  }
})();

interface ShadowSummaryV0 {
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

function runShadow(snapshot: unknown): Promise<ShadowSummaryV0> {
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
