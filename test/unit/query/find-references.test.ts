import { describe, expect, it } from "vitest";
import { WorkspaceReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import {
  WorkspaceSemanticWorkspaceReferenceIndex,
  type SemanticWorkspaceReferenceIndex,
} from "../../../server/src/core/semantic/workspace-reference-index";
import {
  findSelectorReferenceSites,
  hasNonDirectSelectorReferenceSites,
} from "../../../server/src/core/query/find-references";
import type { SemanticReferenceSite } from "../../../server/src/core/semantic/reference-index";
import { siteAt } from "../../_fixtures/test-helpers";

describe("findSelectorReferenceSites", () => {
  it("prefers semantic sites when they exist", () => {
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///src/Button.tsx", [
      siteAt("file:///src/Button.tsx", "button", 3, "/src/Button.module.scss"),
    ]);

    const semanticReferenceIndex = withSemanticSites([
      semanticSite({
        uri: "file:///src/Button.tsx",
        line: 8,
        selectorFilePath: "/src/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
      }),
    ]);

    expect(
      findSelectorReferenceSites(
        { reverseIndex, semanticReferenceIndex },
        "/src/Button.module.scss",
        "button",
      ),
    ).toEqual([
      expect.objectContaining({
        uri: "file:///src/Button.tsx",
        range: {
          start: { line: 8, character: 10 },
          end: { line: 8, character: 16 },
        },
        expansion: "direct",
      }),
    ]);
  });

  it("falls back to reverse-index static sites when semantic data is absent", () => {
    const reverseIndex = new WorkspaceReverseIndex();
    reverseIndex.record("file:///src/Button.tsx", [
      siteAt("file:///src/Button.tsx", "button", 3, "/src/Button.module.scss"),
    ]);

    expect(
      findSelectorReferenceSites(
        {
          reverseIndex,
          semanticReferenceIndex: new WorkspaceSemanticWorkspaceReferenceIndex(),
        },
        "/src/Button.module.scss",
        "button",
      ),
    ).toEqual([
      expect.objectContaining({
        uri: "file:///src/Button.tsx",
        range: {
          start: { line: 3, character: 10 },
          end: { line: 3, character: 16 },
        },
        expansion: "direct",
      }),
    ]);
  });

  it("treats inferred semantic sites as blocking rename references", () => {
    const reverseIndex = new WorkspaceReverseIndex();
    const semanticReferenceIndex = withSemanticSites([
      semanticSite({
        uri: "file:///src/Button.tsx",
        line: 5,
        selectorFilePath: "/src/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "inferred",
      }),
    ]);

    expect(
      hasNonDirectSelectorReferenceSites(
        { reverseIndex, semanticReferenceIndex },
        "/src/Button.module.scss",
        "button",
      ),
    ).toBe(true);
  });
});

function withSemanticSites(
  sites: readonly SemanticReferenceSite[],
): SemanticWorkspaceReferenceIndex {
  const index = new WorkspaceSemanticWorkspaceReferenceIndex();
  index.record("file:///src/Button.tsx", sites);
  return index;
}

function semanticSite(args: {
  readonly uri: string;
  readonly line: number;
  readonly selectorFilePath: string;
  readonly canonicalName: string;
  readonly className: string;
  readonly certainty: "exact" | "inferred" | "possible";
}): SemanticReferenceSite {
  return {
    refId: `ref:${args.line}`,
    selectorId: `selector:${args.canonicalName}`,
    filePath: "/src/Button.tsx",
    uri: args.uri,
    range: {
      start: { line: args.line, character: 10 },
      end: { line: args.line, character: 10 + args.className.length },
    },
    origin: "cxCall",
    scssModulePath: args.selectorFilePath,
    selectorFilePath: args.selectorFilePath,
    canonicalName: args.canonicalName,
    className: args.className,
    certainty: args.certainty,
    reason: args.certainty === "exact" ? "literal" : "typeUnion",
    expansion: args.certainty === "exact" ? "direct" : "expanded",
  };
}
