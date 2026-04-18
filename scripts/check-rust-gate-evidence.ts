import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { RUST_GATE_EVIDENCE_CORPUS } from "./rust-gate-evidence-corpus";

interface RustGateEvidenceResult {
  readonly label: string;
  readonly durationMs: number;
  readonly exitCode: number;
}

const jsonMode = process.argv.includes("--json");
const results: RustGateEvidenceResult[] = [];

for (const entry of RUST_GATE_EVIDENCE_CORPUS) {
  const start = performance.now();
  const child = spawnSync("pnpm", entry.argv, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: jsonMode ? "pipe" : "inherit",
  });
  const durationMs = performance.now() - start;
  const exitCode = child.status ?? 1;
  results.push({
    label: entry.label,
    durationMs,
    exitCode,
  });

  if (jsonMode && child.stdout) process.stdout.write(child.stdout);
  if (jsonMode && child.stderr) process.stderr.write(child.stderr);
}

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: "1",
        tool: "css-module-explainer/rust-gate-evidence",
        results: results.map((result) => ({
          label: result.label,
          durationMs: Number(result.durationMs.toFixed(2)),
          exitCode: result.exitCode,
        })),
      },
      null,
      2,
    )}\n`,
  );
} else {
  process.stdout.write("== Rust gate evidence ==\n");
  for (const result of results) {
    process.stdout.write(
      `${result.label}: ${result.exitCode === 0 ? "ok" : "failed"} (${result.durationMs.toFixed(2)} ms)\n`,
    );
  }
}

process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;
