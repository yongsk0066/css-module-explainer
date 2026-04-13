import { describe, expect, it } from "vitest";
import {
  WorkspaceSemanticWorkspaceReferenceIndex,
  type SemanticWorkspaceReferenceIndex,
} from "../../../server/src/core/semantic/workspace-reference-index";
import {
  findSelectorReferenceSites,
  hasNonDirectSelectorReferenceSites,
} from "../../../server/src/core/query/find-references";
import type { SemanticReferenceSite } from "../../../server/src/core/semantic/reference-index";
import { semanticSiteAt } from "../../_fixtures/test-helpers";

describe("findSelectorReferenceSites", () => {
  it("returns semantic sites", () => {
    const semanticReferenceIndex = withSemanticSites([
      semanticSiteAt("file:///src/Button.tsx", "button", 8, "/src/Button.module.scss"),
    ]);

    expect(
      findSelectorReferenceSites({ semanticReferenceIndex }, "/src/Button.module.scss", "button"),
    ).toEqual([
      expect.objectContaining({
        uri: "file:///src/Button.tsx",
        range: {
          start: { line: 8, character: 10 },
          end: { line: 8, character: 16 },
        },
        expansion: "direct",
        selectorCertainty: "exact",
      }),
    ]);
  });

  it("returns [] when semantic data is absent", () => {
    expect(
      findSelectorReferenceSites(
        { semanticReferenceIndex: new WorkspaceSemanticWorkspaceReferenceIndex() },
        "/src/Button.module.scss",
        "button",
      ),
    ).toEqual([]);
  });

  it("can filter out expanded sites explicitly", () => {
    const semanticReferenceIndex = withSemanticSites([
      semanticSite({
        uri: "file:///src/Button.tsx",
        line: 5,
        selectorFilePath: "/src/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        expansion: "expanded",
      }),
      semanticSite({
        uri: "file:///src/Button.tsx",
        line: 8,
        selectorFilePath: "/src/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        expansion: "direct",
      }),
    ]);

    expect(
      findSelectorReferenceSites({ semanticReferenceIndex }, "/src/Button.module.scss", "button", {
        includeExpanded: false,
      }),
    ).toEqual([
      expect.objectContaining({
        range: {
          start: { line: 8, character: 10 },
          end: { line: 8, character: 16 },
        },
        expansion: "direct",
      }),
    ]);
  });

  it("can filter by minimum certainty independently of expansion", () => {
    const semanticReferenceIndex = withSemanticSites([
      semanticSite({
        uri: "file:///src/Button.tsx",
        line: 5,
        selectorFilePath: "/src/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "possible",
      }),
      semanticSite({
        uri: "file:///src/Button.tsx",
        line: 8,
        selectorFilePath: "/src/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        expansion: "expanded",
      }),
    ]);

    expect(
      findSelectorReferenceSites({ semanticReferenceIndex }, "/src/Button.module.scss", "button", {
        minimumSelectorCertainty: "exact",
      }),
    ).toEqual([
      expect.objectContaining({
        range: {
          start: { line: 8, character: 10 },
          end: { line: 8, character: 16 },
        },
        selectorCertainty: "exact",
        expansion: "expanded",
      }),
    ]);
  });

  it("treats inferred semantic sites as blocking rename references", () => {
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
        { semanticReferenceIndex },
        "/src/Button.module.scss",
        "button",
      ),
    ).toBe(true);
  });

  it("treats exact-but-expanded semantic sites as blocking rename references", () => {
    const semanticReferenceIndex = withSemanticSites([
      semanticSite({
        uri: "file:///src/Button.tsx",
        line: 5,
        selectorFilePath: "/src/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        expansion: "expanded",
      }),
    ]);

    expect(
      hasNonDirectSelectorReferenceSites(
        { semanticReferenceIndex },
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
  readonly expansion?: "direct" | "expanded";
}): SemanticReferenceSite {
  const expansion = args.expansion ?? (args.certainty === "exact" ? "direct" : "expanded");
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
    selectorCertainty: args.certainty,
    reason: args.certainty === "exact" ? "literal" : "typeUnion",
    expansion,
  };
}
