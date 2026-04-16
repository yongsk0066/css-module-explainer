import { describe, expect, it } from "vitest";
import {
  buildServerCapabilities,
  resolveClientRuntimeCapabilities,
} from "../../server/adapter-vscode/src/server-capabilities";

describe("server capabilities", () => {
  it("builds the stable LSP capability surface", () => {
    const capabilities = buildServerCapabilities();

    expect(capabilities.textDocumentSync).toBe(2);
    expect(capabilities.definitionProvider).toBe(true);
    expect(capabilities.hoverProvider).toBe(true);
    expect(capabilities.referencesProvider).toBe(true);
    expect(capabilities.workspace?.workspaceFolders?.supported).toBe(true);
  });

  it("derives client runtime capability flags from initialize params", () => {
    const resolved = resolveClientRuntimeCapabilities({
      processId: null,
      capabilities: {
        workspace: {
          didChangeWatchedFiles: { dynamicRegistration: true },
          codeLens: { refreshSupport: true },
          workspaceFolders: true,
        },
      },
    });

    expect(resolved).toEqual({
      dynamicWatchers: true,
      codeLensRefresh: true,
      workspaceFolders: true,
    });
  });
});
