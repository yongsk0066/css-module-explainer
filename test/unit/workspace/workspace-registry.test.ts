import { describe, expect, it } from "vitest";
import type { ProviderDeps } from "../../../server/src/providers/provider-deps";
import {
  WorkspaceRegistry,
  pickOwningWorkspaceFolder,
} from "../../../server/engine-host-node/src/workspace/workspace-registry";
import { makeBaseDeps } from "../../_fixtures/test-helpers";

function makeDeps(workspaceRoot: string, workspaceFolderUri: string): ProviderDeps {
  return makeBaseDeps({
    workspaceRoot,
    workspaceFolderUri,
  });
}

describe("WorkspaceRegistry", () => {
  it("resolves a document to the owning workspace folder", () => {
    const registry = new WorkspaceRegistry();
    registry.register(
      { uri: "file:///repo/apps/web", rootPath: "/repo/apps/web", name: "web" },
      makeDeps("/repo/apps/web", "file:///repo/apps/web"),
    );
    registry.register(
      { uri: "file:///repo/packages/ui", rootPath: "/repo/packages/ui", name: "ui" },
      makeDeps("/repo/packages/ui", "file:///repo/packages/ui"),
    );

    expect(registry.getDeps("file:///repo/apps/web/src/App.tsx")?.workspaceRoot).toBe(
      "/repo/apps/web",
    );
    expect(registry.getDeps("file:///repo/packages/ui/src/Button.tsx")?.workspaceRoot).toBe(
      "/repo/packages/ui",
    );
  });

  it("prefers the longest matching root for nested folders", () => {
    const registry = new WorkspaceRegistry();
    registry.register(
      { uri: "file:///repo", rootPath: "/repo", name: "repo" },
      makeDeps("/repo", "file:///repo"),
    );
    registry.register(
      { uri: "file:///repo/apps/web", rootPath: "/repo/apps/web", name: "web" },
      makeDeps("/repo/apps/web", "file:///repo/apps/web"),
    );

    expect(registry.getDeps("file:///repo/apps/web/src/App.tsx")?.workspaceRoot).toBe(
      "/repo/apps/web",
    );
  });

  it("exposes the same longest-root ownership rule as a pure helper", () => {
    const folders = [
      { uri: "file:///repo", rootPath: "/repo", name: "repo" },
      { uri: "file:///repo/apps/web", rootPath: "/repo/apps/web", name: "web" },
    ] as const;

    expect(pickOwningWorkspaceFolder(folders, "/repo/apps/web/src/App.tsx")?.uri).toBe(
      "file:///repo/apps/web",
    );
    expect(pickOwningWorkspaceFolder(folders, "/repo/packages/ui/src/Button.tsx")?.uri).toBe(
      "file:///repo",
    );
  });

  it("returns null when a path is outside every workspace folder", () => {
    const registry = new WorkspaceRegistry();
    registry.register(
      { uri: "file:///repo/apps/web", rootPath: "/repo/apps/web", name: "web" },
      makeDeps("/repo/apps/web", "file:///repo/apps/web"),
    );

    expect(registry.getDeps("file:///elsewhere/src/App.tsx")).toBeNull();
  });
});
