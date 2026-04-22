import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { resolveSelectorReferenceLocations } from "../../../server/engine-host-node/src/selector-references-query";
import { makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";

describe("resolveSelectorReferenceLocations", () => {
  it("returns reference ranges for a selector target", () => {
    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///fake/src/App.tsx", [
      semanticSiteAt("file:///fake/src/App.tsx", "indicator", 10, "/fake/src/Button.module.scss"),
    ]);
    const deps = makeBaseDeps({
      workspaceRoot: "/fake",
      semanticReferenceIndex: idx,
    });

    const result = resolveSelectorReferenceLocations(deps, {
      filePath: "/fake/src/Button.module.scss",
      canonicalName: "indicator",
    });

    expect(result).toEqual([
      {
        uri: "file:///fake/src/App.tsx",
        range: {
          start: { line: 10, character: 10 },
          end: { line: 10, character: 19 },
        },
      },
    ]);
  });

  it("returns an empty list when no references exist", () => {
    const deps = makeBaseDeps({
      workspaceRoot: "/fake",
    });

    const result = resolveSelectorReferenceLocations(deps, {
      filePath: "/fake/src/Button.module.scss",
      canonicalName: "indicator",
    });

    expect(result).toEqual([]);
  });
});
