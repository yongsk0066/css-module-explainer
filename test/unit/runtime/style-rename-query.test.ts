import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";
import {
  readStyleRenameTargetAtCursor,
  planStyleRenameAtCursor,
} from "../../../server/engine-host-node/src/style-rename-query";

const SCSS_PATH = "/fake/src/Button.module.scss";

describe("style rename query", () => {
  it("reads a target and plans SCSS plus source edits", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSiteAt("file:///fake/src/App.tsx", "indicator", 10, SCSS_PATH),
    ]);
    const deps = makeBaseDeps({
      selectorMapForPath: () => new Map([["indicator", infoAtLine("indicator", 1)]]),
      workspaceRoot: "/fake",
      semanticReferenceIndex,
    });
    const styleDocument = deps.styleDocumentForPath(SCSS_PATH);

    expect(styleDocument).not.toBeNull();
    const target = readStyleRenameTargetAtCursor(SCSS_PATH, 1, 3, styleDocument!, deps);
    expect(target.kind).toBe("target");
    expect(target.kind === "target" ? target.target.placeholder : null).toBe("indicator");

    const plan = planStyleRenameAtCursor(SCSS_PATH, 1, 3, styleDocument!, deps, "status");
    expect(plan?.kind).toBe("plan");
    expect(plan?.kind === "plan" ? plan.plan.edits.map((edit) => edit.newText) : []).toEqual([
      "status",
      "status",
    ]);
  });

  it("returns null when no selector target exists", () => {
    const deps = makeBaseDeps({
      selectorMapForPath: () => new Map([["indicator", infoAtLine("indicator", 1)]]),
      workspaceRoot: "/fake",
    });
    const styleDocument = deps.styleDocumentForPath(SCSS_PATH);

    expect(styleDocument).not.toBeNull();
    expect(planStyleRenameAtCursor(SCSS_PATH, 99, 0, styleDocument!, deps, "status")).toBeNull();
  });
});
