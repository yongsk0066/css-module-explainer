import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readClientLspServerRuntimeSetting,
  resolveLspServerRuntimeSelection,
  resolveOmenaLspServerPath,
} from "../../../client/src/lsp-server-runtime-config";

describe("client LSP server runtime config", () => {
  it("defaults invalid runtime settings to the Node server", () => {
    expect(readClientLspServerRuntimeSetting("future")).toBe("node");
    expect(readClientLspServerRuntimeSetting(undefined)).toBe("node");
  });

  it("keeps the Node server as the default runtime selection", () => {
    expect(resolveLspServerRuntimeSelection("node", "/repo")).toEqual({ runtime: "node" });
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
    const selected = resolveLspServerRuntimeSelection(
      "omena-lsp-server",
      extensionRoot,
      {},
      (candidate) => candidate.includes(path.join("dist", "bin")),
    );

    expect(selected).toMatchObject({
      runtime: "omena-lsp-server",
      args: [],
    });
  });
});
