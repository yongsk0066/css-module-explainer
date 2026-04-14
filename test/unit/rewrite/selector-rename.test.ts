import { describe, expect, it } from "vitest";
import {
  planSelectorRename,
  readExpressionRenameTarget,
  readStyleSelectorRenameTargetAtCursor,
} from "../../../server/src/core/rewrite/selector-rename";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import { DEFAULT_SETTINGS } from "../../../server/src/settings";
import {
  makeLiteralClassExpression,
  makeTemplateClassExpression,
} from "../../../server/src/core/hir/source-types";
import { makeStyleDocumentFixture, makeTestSelector } from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/src/Button.module.scss";

function makeEnv() {
  return {
    semanticReferenceIndex: new WorkspaceSemanticWorkspaceReferenceIndex(),
    settings: DEFAULT_SETTINGS,
  };
}

describe("selector rename planner", () => {
  it("blocks style-side rename targets that have expanded references", () => {
    const env = makeEnv();
    env.semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      {
        refId: "ref:app:1:10",
        selectorId: `selector:${SCSS_PATH}:btn-small`,
        filePath: "/fake/src/App.tsx",
        uri: "file:///fake/src/App.tsx",
        range: {
          start: { line: 1, character: 10 },
          end: { line: 1, character: 20 },
        },
        origin: "cxCall",
        scssModulePath: SCSS_PATH,
        selectorFilePath: SCSS_PATH,
        canonicalName: "btn-small",
        className: "btn-small",
        selectorCertainty: "inferred",
        reason: "templatePrefix",
        expansion: "expanded",
      },
    ]);
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [makeTestSelector("btn-small", 1)]);

    const result = readStyleSelectorRenameTargetAtCursor(SCSS_PATH, 1, 3, styleDocument, env);
    expect(result).toEqual({ kind: "blocked", reason: "expandedReferences" });
  });

  it("blocks dynamic source expressions before rewrite planning", () => {
    const env = makeEnv();
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [makeTestSelector("btn-small", 1)]);
    const expression = makeTemplateClassExpression(
      "expr:1",
      "cxCall",
      SCSS_PATH,
      "btn-${variant}",
      "btn-",
      {
        start: { line: 3, character: 14 },
        end: { line: 3, character: 28 },
      },
    );

    const result = readExpressionRenameTarget(expression, styleDocument, env);
    expect(result).toEqual({ kind: "blocked", reason: "dynamicExpression" });
  });

  it("returns explicit BEM edit block reasons", () => {
    const env = makeEnv();
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [
      makeTestSelector("button--primary", 1, {
        nestedSafety: "bemSuffixSafe",
        bemSuffix: {
          rawToken: "&--primary",
          rawTokenRange: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 12 },
          },
          parentResolvedName: "button",
        },
      }),
    ]);
    const targetResult = readStyleSelectorRenameTargetAtCursor(SCSS_PATH, 1, 3, styleDocument, env);
    expect(targetResult.kind).toBe("target");
    if (targetResult.kind !== "target") return;

    expect(planSelectorRename(targetResult.target, "banner--tiny")).toEqual({
      kind: "blocked",
      reason: "crossParentBemRename",
    });
    expect(planSelectorRename(targetResult.target, "button--primary")).toEqual({
      kind: "blocked",
      reason: "noopBemRename",
    });
    expect(planSelectorRename(targetResult.target, "button")).toEqual({
      kind: "blocked",
      reason: "emptyBemSuffixRename",
    });
  });

  it("builds direct rewrite edits for literal source expressions", () => {
    const env = makeEnv();
    env.semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      {
        refId: "ref:app:3:14",
        selectorId: `selector:${SCSS_PATH}:button`,
        filePath: "/fake/src/App.tsx",
        uri: "file:///fake/src/App.tsx",
        range: {
          start: { line: 3, character: 14 },
          end: { line: 3, character: 22 },
        },
        origin: "cxCall",
        scssModulePath: SCSS_PATH,
        selectorFilePath: SCSS_PATH,
        canonicalName: "button",
        className: "button",
        selectorCertainty: "exact",
        reason: "literal",
        expansion: "direct",
      },
    ]);
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [makeTestSelector("button", 1)]);
    const expression = makeLiteralClassExpression("expr:1", "cxCall", SCSS_PATH, "button", {
      start: { line: 3, character: 14 },
      end: { line: 3, character: 22 },
    });

    const targetResult = readExpressionRenameTarget(expression, styleDocument, env);
    expect(targetResult.kind).toBe("target");
    if (targetResult.kind !== "target") return;

    const plan = planSelectorRename(targetResult.target, "hero");
    expect(plan.kind).toBe("plan");
    if (plan.kind !== "plan") return;

    expect(plan.plan.edits).toEqual([
      {
        uri: "file:///fake/src/Button.module.scss",
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 8 },
        },
        newText: "hero",
      },
      {
        uri: "file:///fake/src/App.tsx",
        range: {
          start: { line: 3, character: 14 },
          end: { line: 3, character: 22 },
        },
        newText: "hero",
      },
    ]);
  });
});
