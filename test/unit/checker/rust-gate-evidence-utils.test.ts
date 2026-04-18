import { describe, expect, it } from "vitest";
import {
  parseRustGateRepeatArg,
  summarizeRustGateRuns,
} from "../../../scripts/rust-gate-evidence-utils";

describe("rust gate evidence utils", () => {
  it("defaults repeat count to 1", () => {
    expect(parseRustGateRepeatArg([])).toBe(1);
  });

  it("parses an explicit repeat count", () => {
    expect(parseRustGateRepeatArg(["--repeat", "3"])).toBe(3);
  });

  it("summarizes run durations with percentile-style buckets", () => {
    expect(summarizeRustGateRuns([8, 10, 12, 40])).toEqual({
      runCount: 4,
      minMs: 8,
      averageMs: 17.5,
      p50Ms: 10,
      p95Ms: 40,
      maxMs: 40,
    });
  });
});
