import { describe, expect, it } from "vitest";
import {
  buildEngineShadowRunnerInvocation,
  resolveSelectedQueryBackendKind,
  usesRustExpressionSemanticsBackend,
  usesRustSelectorUsageBackend,
  usesRustSourceResolutionBackend,
} from "../../../server/engine-host-node/src/selected-query-backend";

describe("selected query backend", () => {
  it("treats rust-selected-query as the unified Rust backend", () => {
    const kind = resolveSelectedQueryBackendKind({
      CME_SELECTED_QUERY_BACKEND: "rust-selected-query",
    } as NodeJS.ProcessEnv);

    expect(kind).toBe("rust-selected-query");
    expect(usesRustSourceResolutionBackend(kind)).toBe(true);
    expect(usesRustExpressionSemanticsBackend(kind)).toBe(true);
    expect(usesRustSelectorUsageBackend(kind)).toBe(true);
  });

  it("keeps individual Rust backend selectors narrow", () => {
    expect(usesRustSourceResolutionBackend("rust-source-resolution")).toBe(true);
    expect(usesRustExpressionSemanticsBackend("rust-source-resolution")).toBe(false);
    expect(usesRustSelectorUsageBackend("rust-source-resolution")).toBe(false);

    expect(usesRustSourceResolutionBackend("rust-expression-semantics")).toBe(false);
    expect(usesRustExpressionSemanticsBackend("rust-expression-semantics")).toBe(true);
    expect(usesRustSelectorUsageBackend("rust-expression-semantics")).toBe(false);

    expect(usesRustSourceResolutionBackend("rust-selector-usage")).toBe(false);
    expect(usesRustExpressionSemanticsBackend("rust-selector-usage")).toBe(false);
    expect(usesRustSelectorUsageBackend("rust-selector-usage")).toBe(true);
  });

  it("uses cargo run by default so stale local runner binaries are not reused accidentally", () => {
    const invocation = buildEngineShadowRunnerInvocation(
      "input-source-resolution-canonical-producer",
      {
        CME_ENGINE_SHADOW_RUNNER: "",
      } as NodeJS.ProcessEnv,
    );

    expect(invocation.command).toBe("cargo");
    expect(invocation.args).toEqual([
      "run",
      "--manifest-path",
      expect.stringContaining("rust/Cargo.toml"),
      "-p",
      "engine-shadow-runner",
      "--quiet",
      "--",
      "input-source-resolution-canonical-producer",
    ]);
  });

  it("can run the prebuilt engine-shadow-runner after the warmup build", () => {
    const invocation = buildEngineShadowRunnerInvocation(
      "input-selector-usage-canonical-producer",
      {
        CME_ENGINE_SHADOW_RUNNER: "prebuilt",
      } as NodeJS.ProcessEnv,
      () => true,
    );

    expect(invocation.command).toContain("engine-shadow-runner");
    expect(invocation.args).toEqual(["input-selector-usage-canonical-producer"]);
  });

  it("fails fast when prebuilt mode is requested before the runner exists", () => {
    expect(() =>
      buildEngineShadowRunnerInvocation(
        "input-expression-semantics-canonical-producer",
        {
          CME_ENGINE_SHADOW_RUNNER: "prebuilt",
        } as NodeJS.ProcessEnv,
        () => false,
      ),
    ).toThrow(/check:rust-selected-query-warmup/u);
  });
});
