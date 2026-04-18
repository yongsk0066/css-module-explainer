import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import {
  RUST_GATE_EVIDENCE_CORPUS,
  RUST_GATE_EVIDENCE_VARIANTS,
  type RustGateEvidenceVariant,
} from "./rust-gate-evidence-corpus";

interface RustGateEvidenceResult {
  readonly variant: string;
  readonly label: string;
  readonly durationMs: number;
  readonly exitCode: number;
}

const jsonMode = process.argv.includes("--json");
const selectedVariantLabels = parseVariantArgs(process.argv.slice(2));
const selectedVariants = resolveVariants(selectedVariantLabels);
const results: RustGateEvidenceResult[] = [];

for (const variant of selectedVariants) {
  for (const entry of RUST_GATE_EVIDENCE_CORPUS) {
    const start = performance.now();
    const child = spawnSync("pnpm", entry.argv, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: jsonMode ? "pipe" : "inherit",
      env: {
        ...process.env,
        ...variant.env,
      },
    });
    const durationMs = performance.now() - start;
    const exitCode = child.status ?? 1;
    results.push({
      variant: variant.label,
      label: entry.label,
      durationMs,
      exitCode,
    });

    if (jsonMode && child.stdout) process.stdout.write(child.stdout);
    if (jsonMode && child.stderr) process.stderr.write(child.stderr);
  }
}

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: "2",
        tool: "css-module-explainer/rust-gate-evidence",
        variants: selectedVariants.map((variant) => ({
          label: variant.label,
        })),
        results: results.map((result) => ({
          variant: result.variant,
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
  for (const variant of selectedVariants) {
    process.stdout.write(`-- ${variant.label} --\n`);
    for (const result of results.filter((candidate) => candidate.variant === variant.label)) {
      process.stdout.write(
        `${result.label}: ${result.exitCode === 0 ? "ok" : "failed"} (${result.durationMs.toFixed(2)} ms)\n`,
      );
    }
  }
}

process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;

function parseVariantArgs(argv: readonly string[]): readonly string[] {
  const labels: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--variant") continue;
    const value = argv[index + 1];
    if (value) {
      labels.push(value);
      index += 1;
    }
  }

  return labels;
}

function resolveVariants(labels: readonly string[]): readonly RustGateEvidenceVariant[] {
  if (labels.length === 0) return RUST_GATE_EVIDENCE_VARIANTS;

  const selected = labels.map((label) =>
    RUST_GATE_EVIDENCE_VARIANTS.find((variant) => variant.label === label),
  );
  const missing = labels.filter((_, index) => !selected[index]);
  if (missing.length > 0) {
    throw new Error(`Unknown rust gate evidence variant: ${missing.join(", ")}`);
  }

  return selected;
}
