import { describe, expect, it } from "vitest";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/compat/style-document-builder-compat";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import { findUnusedSelectors } from "../../../server/src/core/query/compute-unused-selectors";
import { infoAtLine as info, semanticSiteAt } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/Button.module.scss";

function styleDocument(classMap: ScssClassMap) {
  return buildStyleDocumentFromClassMap(SCSS_PATH, classMap);
}

describe("findUnusedSelectors", () => {
  it("returns canonical unused selectors once", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 5, SCSS_PATH),
    ]);

    expect(findUnusedSelectors(SCSS_PATH, styleDocument(classMap), semanticReferenceIndex)).toEqual(
      [
        {
          canonicalName: "active",
          range: { start: { line: 3, character: 1 }, end: { line: 3, character: 7 } },
        },
      ],
    );
  });

  it("suppresses findings when the module still has unresolved dynamic refs", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record(
      "file:///a.tsx",
      [],
      [
        {
          refId: "ref:size",
          uri: "file:///a.tsx",
          filePath: "/fake/a.tsx",
          range: { start: { line: 5, character: 10 }, end: { line: 5, character: 18 } },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          expressionKind: "symbolRef",
          hasResolvedTargets: false,
          isDynamic: true,
        },
      ],
    );

    expect(findUnusedSelectors(SCSS_PATH, styleDocument(classMap), semanticReferenceIndex)).toEqual(
      [],
    );
  });

  it("keeps findings when dynamic refs were resolved semantically", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record(
      "file:///a.tsx",
      [
        {
          refId: "ref:size",
          selectorId: "selector:indicator",
          filePath: "/fake/a.tsx",
          uri: "file:///a.tsx",
          range: { start: { line: 5, character: 10 }, end: { line: 5, character: 18 } },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          selectorFilePath: SCSS_PATH,
          canonicalName: "indicator",
          className: "indicator",
          certainty: "inferred",
          reason: "flowBranch",
          expansion: "expanded",
        },
      ],
      [
        {
          refId: "ref:size",
          uri: "file:///a.tsx",
          filePath: "/fake/a.tsx",
          range: { start: { line: 5, character: 10 }, end: { line: 5, character: 18 } },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          expressionKind: "symbolRef",
          hasResolvedTargets: true,
          isDynamic: true,
        },
      ],
    );

    expect(findUnusedSelectors(SCSS_PATH, styleDocument(classMap), semanticReferenceIndex)).toEqual(
      [
        {
          canonicalName: "active",
          range: { start: { line: 3, character: 1 }, end: { line: 3, character: 7 } },
        },
      ],
    );
  });

  it("counts semantic references even when the compatibility index is empty", () => {
    const classMap: ScssClassMap = new Map([
      ["indicator", info("indicator", 1)],
      ["active", info("active", 3)],
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      {
        refId: "ref:1",
        selectorId: "selector:indicator",
        filePath: "/fake/a.tsx",
        uri: "file:///a.tsx",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 19 } },
        origin: "cxCall",
        scssModulePath: SCSS_PATH,
        selectorFilePath: SCSS_PATH,
        canonicalName: "indicator",
        className: "indicator",
        certainty: "exact",
        reason: "literal",
        expansion: "direct",
      },
    ]);

    expect(findUnusedSelectors(SCSS_PATH, styleDocument(classMap), semanticReferenceIndex)).toEqual(
      [
        {
          canonicalName: "active",
          range: { start: { line: 3, character: 1 }, end: { line: 3, character: 7 } },
        },
      ],
    );
  });
});
