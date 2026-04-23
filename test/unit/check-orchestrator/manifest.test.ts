import { describe, expect, it } from "vitest";
import {
  loadCheckManifest,
  resolveGateTarget,
  runDoctor,
} from "../../../packages/check-orchestrator/src";

describe("check orchestrator manifest", () => {
  const manifest = loadCheckManifest();

  it("mirrors the current root scripts without doctor errors", () => {
    expect(manifest.gates.length).toBeGreaterThan(150);
    expect(runDoctor(manifest).filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("assigns stable ids for representative scopes", () => {
    expect(resolveGateTarget(manifest, "rust/selected-query/consumers")?.scriptName).toBe(
      "check:rust-selected-query-consumers",
    );
    expect(resolveGateTarget(manifest, "ts7/phase-b/protocol@tsgo")?.scriptName).toBe(
      "check:ts7-phase-b-protocol-tsgo",
    );
    expect(resolveGateTarget(manifest, "tooling/orchestrator-doctor")?.scriptName).toBe(
      "check:orchestrator-doctor",
    );
    expect(
      resolveGateTarget(manifest, "release/check/packaged-engine-shadow-runner")?.scriptName,
    ).toBe("check:packaged-engine-shadow-runner");
  });

  it("tracks bundle script references", () => {
    const releaseBundle = resolveGateTarget(manifest, "rust/release/bundle");
    expect(releaseBundle?.kind).toBe("bundle");
    expect(releaseBundle?.referencedScripts).toContain("check:rust-workspace");
    expect(releaseBundle?.referencedScripts).toContain("check:rust-producer-boundary");
  });
});
