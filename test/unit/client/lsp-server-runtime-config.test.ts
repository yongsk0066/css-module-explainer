import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRustLspFileWatcherGlobs,
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

  it("falls back to the Node server for auto runtime selection without a Rust binary", () => {
    expect(resolveLspServerRuntimeSelection("auto", "/repo", {}, () => false)).toEqual({
      runtime: "node",
    });
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

  it("declares static file watchers for the Rust LSP runtime", () => {
    expect(buildRustLspFileWatcherGlobs()).toEqual([
      "**/*.module.{scss,css,less}",
      "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,d.ts}",
      "**/tsconfig*.json",
      "**/jsconfig*.json",
    ]);
  });
});
