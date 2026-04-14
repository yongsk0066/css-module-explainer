import { describe, expect, it } from "vitest";
import { createWorkspaceRuntimeSettingsState } from "../../../server/src/runtime/workspace-runtime-settings";

describe("createWorkspaceRuntimeSettingsState", () => {
  it("owns mutable settings state and derived metadata", () => {
    const state = createWorkspaceRuntimeSettingsState("/fake/ws");

    expect(state.settingsKey).toBe("transform:asIs;alias:");
    expect(state.classnameTransform).toBe("asIs");

    state.set({
      ...state.get(),
      scss: {
        ...state.get().scss,
        classnameTransform: "camelCaseOnly",
      },
      pathAlias: {
        "@styles": "src/styles",
      },
    });

    expect(state.classnameTransform).toBe("camelCaseOnly");
    expect(state.settingsKey).toBe("transform:camelCaseOnly;alias:@styles=src/styles");
  });

  it("rebuilds the alias resolver against the latest pathAlias map", () => {
    const state = createWorkspaceRuntimeSettingsState("/fake/ws");

    state.rebuildAliasResolver({
      "@styles": "src/styles",
    });

    expect(state.aliasResolver.resolve("@styles/Button.module.scss")).toBe(
      "/fake/ws/src/styles/Button.module.scss",
    );
  });
});
