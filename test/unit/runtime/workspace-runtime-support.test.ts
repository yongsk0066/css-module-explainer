import { describe, expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import type {
  WorkspaceFolderInfo,
  WorkspaceProviderDeps,
} from "../../../server/src/workspace/workspace-registry";
import type { RuntimeSink } from "../../../server/src/runtime/runtime-sink";
import {
  clearWorkspaceDocumentsWithinRoot,
  createOwnedStylePathMatcher,
} from "../../../server/src/runtime/workspace-runtime-support";

describe("workspace runtime support", () => {
  it("matches owned style paths using longest-root ownership", () => {
    const folders: readonly WorkspaceFolderInfo[] = [
      { uri: "file:///workspace", rootPath: "/workspace", name: "workspace" },
      { uri: "file:///workspace/packages/app", rootPath: "/workspace/packages/app", name: "app" },
    ];

    const ownsAppStyles = createOwnedStylePathMatcher(folders, "file:///workspace/packages/app");

    expect(ownsAppStyles("/workspace/packages/app/Button.module.scss")).toBe(true);
    expect(ownsAppStyles("/workspace/shared/Button.module.scss")).toBe(false);
  });

  it("clears only documents within the target workspace root", () => {
    const forgetWithinRoot = vi.fn();
    const forget = vi.fn();
    const invalidate = vi.fn();
    const clearDiagnostics = vi.fn();
    const refreshCodeLens = vi.fn();

    const deps = {
      styleDependencyGraph: { forgetWithinRoot },
      semanticReferenceIndex: { forget },
      analysisCache: { invalidate },
      refreshCodeLens,
    } as unknown as WorkspaceProviderDeps;

    const sink: RuntimeSink = {
      info: vi.fn(),
      error: vi.fn(),
      clearDiagnostics,
      requestCodeLensRefresh: vi.fn(),
    };

    clearWorkspaceDocumentsWithinRoot(
      "/workspace/packages/app",
      {
        all: () => [
          { uri: pathToFileURL("/workspace/packages/app/src/App.tsx").href },
          { uri: pathToFileURL("/workspace/packages/site/src/App.tsx").href },
        ],
      },
      deps,
      sink,
    );

    expect(forgetWithinRoot).toHaveBeenCalledWith("/workspace/packages/app");
    expect(forget).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(clearDiagnostics).toHaveBeenCalledTimes(1);
    expect(refreshCodeLens).toHaveBeenCalledTimes(1);
  });
});
