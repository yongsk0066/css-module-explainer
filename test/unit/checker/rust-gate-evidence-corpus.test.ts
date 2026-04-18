import { describe, expect, it } from "vitest";
import {
  RUST_GATE_EVIDENCE_CORPUS,
  RUST_GATE_EVIDENCE_VARIANTS,
} from "../../../scripts/rust-gate-evidence-corpus";

describe("rust gate evidence corpus", () => {
  it("uses unique labels", () => {
    const labels = RUST_GATE_EVIDENCE_CORPUS.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("targets pnpm scripts only", () => {
    for (const entry of RUST_GATE_EVIDENCE_CORPUS) {
      expect(entry.argv.length).toBeGreaterThan(0);
      expect(entry.argv[0]).toMatch(/^check:/);
    }
  });

  it("uses unique variant labels", () => {
    const labels = RUST_GATE_EVIDENCE_VARIANTS.map((variant) => variant.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
