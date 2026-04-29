import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRustLspFileWatcherGlobs,
  buildThinClientRuntimeEndpoint,
  readClientLspServerRuntimeSetting,
  resolveLspServerRuntimeSelection,
  resolveOmenaLspServerPath,
} from "../../../client/src/lsp-server-runtime-config";

describe("client LSP server runtime config", () => {
  it("defaults invalid runtime settings to auto runtime selection", () => {
    expect(readClientLspServerRuntimeSetting("future")).toBe("auto");
    expect(readClientLspServerRuntimeSetting(undefined)).toBe("auto");
  });

  it("keeps the Node server for explicit Node runtime selection", () => {
    expect(resolveLspServerRuntimeSelection("node", "/repo")).toEqual({ runtime: "node" });
  });

  it("does not silently fall back to the Node server for auto runtime selection without a Rust binary", () => {
    expect(() => resolveLspServerRuntimeSelection("auto", "/repo", {}, () => false)).toThrow(
      "cssModuleExplainer.lspServerRuntime=auto requires an omena-lsp-server binary",
    );
  });

  it("resolves an explicit omena-lsp-server binary path", () => {
    const extensionRoot = path.resolve("/repo");
    const explicit = path.join(extensionRoot, "bin", "omena-lsp-server");

    expect(
      resolveOmenaLspServerPath(
        extensionRoot,
        { CME_OMENA_LSP_SERVER_PATH: "bin/omena-lsp-server" },
        (candidate) => candidate === explicit,
      ),
    ).toBe(explicit);
  });

  it("throws when an explicit omena-lsp-server path is missing", () => {
    expect(() =>
      resolveOmenaLspServerPath(
        "/repo",
        { CME_OMENA_LSP_SERVER_PATH: "missing/omena-lsp-server" },
        () => false,
      ),
    ).toThrow("CME_OMENA_LSP_SERVER_PATH points to a missing binary");
  });

  it("selects the packaged omena-lsp-server binary when available", () => {
    const extensionRoot = path.resolve("/repo");
    const selected = resolveLspServerRuntimeSelection("auto", extensionRoot, {}, (candidate) =>
      candidate.includes(path.join("dist", "bin")),
    );

    expect(selected).toMatchObject({
      runtime: "omena-lsp-server",
      args: [],
    });
  });

  it("builds a thin client runtime endpoint for the Rust LSP runtime", () => {
    const endpoint = buildThinClientRuntimeEndpoint(
      {
        runtime: "omena-lsp-server",
        command: "/repo/dist/bin/darwin-arm64/omena-lsp-server",
        args: [],
      },
      "/repo",
    );

    expect(endpoint).toMatchObject({
      product: "css-module-explainer.thin-client-runtime-endpoint",
      runtime: "omena-lsp-server",
      command: "/repo/dist/bin/darwin-arm64/omena-lsp-server",
      cwd: "/repo",
      nodeFallbackAllowed: false,
    });
    expect(endpoint?.fileWatcherGlobs).toEqual(buildRustLspFileWatcherGlobs());
    expect(endpoint?.hostResponsibilities).toContain("startLanguageClient");
    expect(endpoint?.rustResponsibilities).toContain("ownTsgoClientLifecycle");
  });

  it("does not create a thin client endpoint for the Node runtime", () => {
    expect(buildThinClientRuntimeEndpoint({ runtime: "node" }, "/repo")).toBeNull();
  });

  it("declares static file watchers for the Rust LSP runtime", () => {
    expect(buildRustLspFileWatcherGlobs()).toEqual([
      "**/*.module.{scss,css,less}",
      "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,d.ts}",
      "**/tsconfig*.json",
      "**/jsconfig*.json",
    ]);
  });
});
