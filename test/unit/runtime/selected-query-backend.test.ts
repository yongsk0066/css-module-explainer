import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEngineShadowRunnerInvocation,
  canUsePrebuiltEngineShadowRunner,
  isPackagedExtensionRuntime,
  resolveSelectedQueryBackendKind,
  usesRustExpressionSemanticsBackend,
  usesRustSelectorUsageBackend,
  usesRustSourceResolutionBackend,
} from "../../../server/engine-host-node/src/selected-query-backend";

describe("selected query backend", () => {
  it("defaults to typescript-current when no packaged runner is available", () => {
    expect(resolveSelectedQueryBackendKind({}, () => false)).toBe("typescript-current");
  });

  it("keeps source checkout defaults on typescript-current even after a local build", () => {
    expect(
      resolveSelectedQueryBackendKind(
        {
          CME_PROJECT_ROOT: "/workspace/css-module-explainer",
        } as NodeJS.ProcessEnv,
        (filePath) =>
          filePath.includes("dist/bin") ||
          filePath.endsWith("dist/client/extension.js") ||
          filePath.endsWith("dist/server/server.js") ||
          filePath.endsWith("server/engine-host-node/src/selected-query-backend.ts") ||
          filePath.endsWith("rust/Cargo.toml"),
      ),
    ).toBe("typescript-current");
  });

  it("defaults to rust-selected-query in packaged extension runtime", () => {
    const projectRoot = path.join("/extension", "css-module-explainer");
    expect(
      resolveSelectedQueryBackendKind(
        { CME_PROJECT_ROOT: projectRoot } as NodeJS.ProcessEnv,
        (filePath) =>
          filePath.includes("dist/bin") ||
          filePath.endsWith("dist/client/extension.js") ||
          filePath.endsWith("dist/server/server.js"),
      ),
    ).toBe("rust-selected-query");
  });

  it("supports auto as the explicit release-safe default selector", () => {
    expect(
      resolveSelectedQueryBackendKind(
        {
          CME_SELECTED_QUERY_BACKEND: "auto",
          CME_PROJECT_ROOT: "/extension/css-module-explainer",
        } as NodeJS.ProcessEnv,
        (filePath) => filePath.includes("dist/bin"),
      ),
    ).toBe("rust-selected-query");
    expect(
      resolveSelectedQueryBackendKind(
        {
          CME_SELECTED_QUERY_BACKEND: "auto",
          CME_PROJECT_ROOT: "/extension/css-module-explainer",
        } as NodeJS.ProcessEnv,
        () => false,
      ),
    ).toBe("typescript-current");
  });

  it("keeps explicit backend selection stronger than the packaged runner default", () => {
    expect(
      resolveSelectedQueryBackendKind(
        {
          CME_SELECTED_QUERY_BACKEND: "typescript-current",
          CME_PROJECT_ROOT: "/extension/css-module-explainer",
        } as NodeJS.ProcessEnv,
        (filePath) => filePath.includes("dist/bin"),
      ),
    ).toBe("typescript-current");
  });

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

  it("detects whether a prebuilt engine-shadow-runner is available", () => {
    expect(
      canUsePrebuiltEngineShadowRunner(
        {
          CME_PROJECT_ROOT: "/extension/css-module-explainer",
        } as NodeJS.ProcessEnv,
        (filePath) => filePath.includes("dist/bin"),
      ),
    ).toBe(true);
    expect(canUsePrebuiltEngineShadowRunner({}, () => false)).toBe(false);
  });

  it("detects packaged extension runtime separately from source checkout builds", () => {
    const projectRoot = path.join("/extension", "css-module-explainer");
    expect(
      isPackagedExtensionRuntime(
        { CME_PROJECT_ROOT: projectRoot } as NodeJS.ProcessEnv,
        (filePath) =>
          filePath.endsWith("dist/client/extension.js") ||
          filePath.endsWith("dist/server/server.js"),
      ),
    ).toBe(true);
    expect(
      isPackagedExtensionRuntime(
        { CME_PROJECT_ROOT: projectRoot } as NodeJS.ProcessEnv,
        (filePath) =>
          filePath.endsWith("dist/client/extension.js") ||
          filePath.endsWith("dist/server/server.js") ||
          filePath.endsWith("rust/Cargo.toml"),
      ),
    ).toBe(false);
  });

  it("uses cargo run by default so stale local runner binaries are not reused accidentally", () => {
    const invocation = buildEngineShadowRunnerInvocation(
      "input-source-resolution-canonical-producer",
      {
        CME_ENGINE_SHADOW_RUNNER: "",
        CME_PROJECT_ROOT: "/workspace/css-module-explainer",
      } as NodeJS.ProcessEnv,
    );

    expect(invocation.command).toBe("cargo");
    expect(invocation.args).toEqual([
      "run",
      "--manifest-path",
      path.join("/workspace/css-module-explainer", "rust/Cargo.toml"),
      "-p",
      "engine-shadow-runner",
      "--quiet",
      "--",
      "input-source-resolution-canonical-producer",
    ]);
    expect(invocation.cwd).toBe("/workspace/css-module-explainer");
  });

  it("uses the packaged runner by default when it is available", () => {
    const projectRoot = path.join("/extension", "css-module-explainer");
    const packagedRunner = path.join(
      projectRoot,
      "dist/bin",
      `${process.platform}-${process.arch}`,
      process.platform === "win32" ? "engine-shadow-runner.exe" : "engine-shadow-runner",
    );
    const invocation = buildEngineShadowRunnerInvocation(
      "input-source-resolution-canonical-producer",
      {
        CME_PROJECT_ROOT: projectRoot,
      } as NodeJS.ProcessEnv,
      (filePath) => filePath === packagedRunner,
    );

    expect(invocation.command).toBe(packagedRunner);
    expect(invocation.args).toEqual(["input-source-resolution-canonical-producer"]);
    expect(invocation.cwd).toBe(projectRoot);
  });

  it("can run the prebuilt engine-shadow-runner after the warmup build", () => {
    const invocation = buildEngineShadowRunnerInvocation(
      "input-selector-usage-canonical-producer",
      {
        CME_ENGINE_SHADOW_RUNNER: "prebuilt",
        CME_PROJECT_ROOT: "/workspace/css-module-explainer",
      } as NodeJS.ProcessEnv,
      () => true,
    );

    expect(invocation.command).toContain("engine-shadow-runner");
    expect(invocation.args).toEqual(["input-selector-usage-canonical-producer"]);
    expect(invocation.cwd).toBe("/workspace/css-module-explainer");
  });

  it("prefers an explicit prebuilt runner path for packaged runtime experiments", () => {
    const runnerPath = path.join("/extension", "bin", "engine-shadow-runner");
    const invocation = buildEngineShadowRunnerInvocation(
      "input-selector-usage-canonical-producer",
      {
        CME_ENGINE_SHADOW_RUNNER: "prebuilt",
        CME_ENGINE_SHADOW_RUNNER_PATH: runnerPath,
      } as NodeJS.ProcessEnv,
      (filePath) => filePath === runnerPath,
    );

    expect(invocation.command).toBe(runnerPath);
    expect(invocation.args).toEqual(["input-selector-usage-canonical-producer"]);
  });

  it("can resolve a packaged dist/bin runner before falling back to rust target", () => {
    const projectRoot = path.join("/extension", "css-module-explainer");
    const packagedRunner = path.join(
      projectRoot,
      "dist/bin",
      `${process.platform}-${process.arch}`,
      process.platform === "win32" ? "engine-shadow-runner.exe" : "engine-shadow-runner",
    );
    const invocation = buildEngineShadowRunnerInvocation(
      "input-expression-semantics-canonical-producer",
      {
        CME_ENGINE_SHADOW_RUNNER: "prebuilt",
        CME_PROJECT_ROOT: projectRoot,
      } as NodeJS.ProcessEnv,
      (filePath) => filePath === packagedRunner,
    );

    expect(invocation.command).toBe(packagedRunner);
    expect(invocation.args).toEqual(["input-expression-semantics-canonical-producer"]);
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
