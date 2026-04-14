import { describe, expect, it } from "vitest";
import { WorkspaceSemanticReferenceDependencies } from "../../../server/src/core/semantic/reference-dependencies";

describe("WorkspaceSemanticReferenceDependencies", () => {
  it("indexes module usages, settings dependencies, and source dependencies independently", () => {
    const store = new WorkspaceSemanticReferenceDependencies();
    store.rebuild(
      new Map([
        [
          "file:///fake/ws/src/App.tsx",
          {
            moduleUsages: [
              {
                refId: "ref:1",
                uri: "file:///fake/ws/src/App.tsx",
                filePath: "/fake/ws/src/App.tsx",
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 1 },
                },
                origin: "cxCall",
                scssModulePath: "/fake/ws/src/Button.module.scss",
                expressionKind: "symbolRef",
                hasResolvedTargets: false,
                isDynamic: true,
              },
            ],
            deps: {
              workspaceRoot: "/fake/ws",
              settingsKey: "transform:camelCase;alias:@styles=src/styles",
              stylePaths: ["/fake/ws/src/Button.module.scss"],
              sourcePaths: ["/fake/ws/src/theme.ts"],
            },
          },
        ],
      ]),
    );

    expect(store.findModuleUsages("/fake/ws/src/Button.module.scss")).toHaveLength(1);
    expect(store.findReferencingUris("/fake/ws/src/Button.module.scss")).toEqual([
      "file:///fake/ws/src/App.tsx",
    ]);
    expect(
      store.findUrisBySettingsDependency(
        "/fake/ws",
        "transform:camelCase;alias:@styles=src/styles",
      ),
    ).toEqual(["file:///fake/ws/src/App.tsx"]);
    expect(store.findUrisBySourceDependency("/fake/ws", "/fake/ws/src/theme.ts")).toEqual([
      "file:///fake/ws/src/App.tsx",
    ]);
  });
});
