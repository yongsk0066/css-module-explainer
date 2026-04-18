export interface RustGateEvidenceSummary {
  readonly runCount: number;
  readonly minMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export function parseRustGateRepeatArg(argv: readonly string[]): number {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--repeat") continue;
    const value = argv[index + 1];
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error("Expected --repeat <positive-integer>");
    }
    return parsed;
  }

  return 1;
}

export function summarizeRustGateRuns(durationsMs: readonly number[]): RustGateEvidenceSummary {
  if (durationsMs.length === 0) {
    throw new Error("Cannot summarize an empty rust gate evidence run set.");
  }

  const sorted = durationsMs.toSorted((left, right) => left - right);
  const total = sorted.reduce((sum, duration) => sum + duration, 0);

  return {
    runCount: sorted.length,
    minMs: sorted[0]!,
    averageMs: total / sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1)!,
  };
}

function percentile(sortedDurations: readonly number[], ratio: number): number {
  const index = Math.max(0, Math.ceil(sortedDurations.length * ratio) - 1);
  return sortedDurations[index]!;
}
