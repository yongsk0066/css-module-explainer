import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import { createRuntimeDependencySnapshot } from "../../../server/src/runtime/dependency-snapshot";
import { makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";

describe("createRuntimeDependencySnapshot", () => {
  it("reads settings, source, and style dependency lookups through one contract", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record(
      "file:///fake/ws/src/App.tsx",
      [
        semanticSiteAt(
          "file:///fake/ws/src/App.tsx",
          "button",
          1,
          "/fake/ws/src/Button.module.scss",
        ),
      ],
      [
        {
          refId: "ref:1",
          uri: "file:///fake/ws/src/App.tsx",
          filePath: "/fake/ws/src/App.tsx",
          range: {
            start: { line: 1, character: 10 },
            end: { line: 1, character: 16 },
          },
          origin: "cxCall",
          scssModulePath: "/fake/ws/src/Button.module.scss",
          expressionKind: "literal",
          hasResolvedTargets: true,
          isDynamic: false,
        },
      ],
      {
        workspaceRoot: "/fake/ws",
        settingsKey: "transform:camelCase;alias:",
        stylePaths: ["/fake/ws/src/Button.module.scss"],
        sourcePaths: ["/fake/ws/src/theme.ts"],
      },
    );

    const deps = makeBaseDeps({
      workspaceRoot: "/fake/ws",
      workspaceFolderUri: "file:///fake/ws",
      semanticReferenceIndex,
    });
    const snapshot = createRuntimeDependencySnapshot(
      [deps],
      [
        {
          uri: "file:///fake/ws/src/App.tsx",
          filePath: "/fake/ws/src/App.tsx",
          isStyle: false,
          workspaceRoot: "/fake/ws",
        },
      ],
    );

    expect(snapshot.openDocuments).toHaveLength(1);
    expect(snapshot.findSettingsDependencyUris("/fake/ws", "transform:camelCase;alias:")).toEqual([
      "file:///fake/ws/src/App.tsx",
    ]);
    expect(snapshot.findSourceDependencyUris("/fake/ws", "/fake/ws/src/theme.ts")).toEqual([
      "file:///fake/ws/src/App.tsx",
    ]);
    expect(
      snapshot.findStyleDependentSourceUris("/fake/ws", "/fake/ws/src/Button.module.scss"),
    ).toEqual(["file:///fake/ws/src/App.tsx"]);
  });
});
