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

  it("updates incrementally across record and forget", () => {
    const store = new WorkspaceSemanticReferenceDependencies();
    const first = {
      moduleUsages: [
        makeUsage("file:///fake/ws/src/App.tsx", "/fake/ws/src/Button.module.scss", "ref:1"),
      ],
      deps: {
        workspaceRoot: "/fake/ws",
        settingsKey: "transform:asIs;alias:",
        stylePaths: ["/fake/ws/src/Button.module.scss"],
        sourcePaths: ["/fake/ws/src/theme.ts"],
      },
    } as const;
    const second = {
      moduleUsages: [
        makeUsage("file:///fake/ws/src/Card.tsx", "/fake/ws/src/Card.module.scss", "ref:2"),
      ],
      deps: {
        workspaceRoot: "/fake/ws",
        settingsKey: "transform:camelCase;alias:",
        stylePaths: ["/fake/ws/src/Card.module.scss"],
        sourcePaths: ["/fake/ws/src/card-theme.ts"],
      },
    } as const;

    store.record("file:///fake/ws/src/App.tsx", first, 0);
    store.record("file:///fake/ws/src/Card.tsx", second, 1);

    expect(store.findReferencingUris("/fake/ws/src/Button.module.scss")).toEqual([
      "file:///fake/ws/src/App.tsx",
    ]);
    expect(store.findUrisBySettingsDependency("/fake/ws", "transform:camelCase;alias:")).toEqual([
      "file:///fake/ws/src/Card.tsx",
    ]);

    const updatedFirst = {
      ...first,
      moduleUsages: [
        makeUsage("file:///fake/ws/src/App.tsx", "/fake/ws/src/Renamed.module.scss", "ref:3"),
      ],
    } as const;
    store.forget("file:///fake/ws/src/App.tsx", first);
    store.record("file:///fake/ws/src/App.tsx", updatedFirst, 0);

    expect(store.findReferencingUris("/fake/ws/src/Button.module.scss")).toEqual([]);
    expect(store.findReferencingUris("/fake/ws/src/Renamed.module.scss")).toEqual([
      "file:///fake/ws/src/App.tsx",
    ]);

    store.forget("file:///fake/ws/src/Card.tsx", second);
    expect(store.findUrisBySourceDependency("/fake/ws", "/fake/ws/src/card-theme.ts")).toEqual([]);
  });
});

function makeUsage(uri: string, scssModulePath: string, refId: string) {
  return {
    refId,
    uri,
    filePath: uri.replace("file://", ""),
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    origin: "cxCall" as const,
    scssModulePath,
    expressionKind: "symbolRef" as const,
    hasResolvedTargets: false,
    isDynamic: true,
  };
}
