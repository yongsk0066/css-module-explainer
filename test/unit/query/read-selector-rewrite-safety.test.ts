import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import { readSelectorRewriteSafetySummary } from "../../../server/src/core/query/read-selector-rewrite-safety";

const SCSS_PATH = "/fake/src/Button.module.scss";

function makeSite(args: {
  uri: string;
  canonicalName: string;
  className?: string;
  line: number;
  selectorCertainty?: "exact" | "inferred" | "possible";
  expansion?: "direct" | "expanded";
}) {
  return {
    refId: `ref:${args.uri}:${args.line}:10`,
    selectorId: `selector:${SCSS_PATH}:${args.canonicalName}`,
    filePath: args.uri.replace("file://", ""),
    uri: args.uri,
    range: {
      start: { line: args.line, character: 10 },
      end: { line: args.line, character: 10 + (args.className ?? args.canonicalName).length },
    },
    origin: "cxCall" as const,
    scssModulePath: SCSS_PATH,
    selectorFilePath: SCSS_PATH,
    canonicalName: args.canonicalName,
    className: args.className ?? args.canonicalName,
    selectorCertainty: args.selectorCertainty ?? "exact",
    reason: "literal" as const,
    expansion: args.expansion ?? "direct",
  };
}

describe("readSelectorRewriteSafetySummary", () => {
  it("allows direct-only rewrite when all sites are direct", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      makeSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "button",
        line: 3,
      }),
    ]);

    const summary = readSelectorRewriteSafetySummary(
      { semanticReferenceIndex },
      SCSS_PATH,
      "button",
    );
    expect(summary.referenceRewritePolicy).toBe("directOnly");
    expect(summary.hasBlockingExpandedReferences).toBe(false);
    expect(summary.directSites).toHaveLength(1);
  });

  it("blocks direct rewrite when expanded references exist", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      makeSite({
        uri: "file:///fake/src/App.tsx",
        canonicalName: "button",
        line: 3,
        selectorCertainty: "inferred",
        expansion: "expanded",
      }),
    ]);

    const summary = readSelectorRewriteSafetySummary(
      { semanticReferenceIndex },
      SCSS_PATH,
      "button",
    );
    expect(summary.referenceRewritePolicy).toBe("blockedByExpandedReferences");
    expect(summary.hasBlockingExpandedReferences).toBe(true);
    expect(summary.directSites).toHaveLength(0);
  });
});
