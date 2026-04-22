import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { resolveStyleSelectorHoverResult } from "../../../server/engine-host-node/src/style-hover-query";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";

describe("style hover query", () => {
  it("uses rust selector-usage payloads for style hover summaries", () => {
    const deps = makeBaseDeps({
      selectorMapForPath: () => new Map([["indicator", infoAtLine("indicator", 5)]]),
      workspaceRoot: "/fake/ws",
    });

    const result = resolveStyleSelectorHoverResult(
      {
        filePath: SCSS_PATH,
        line: 5,
        character: 3,
      },
      deps,
      {
        env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
        readRustSelectorUsagePayloadForWorkspaceTarget: () => ({
          canonicalName: "indicator",
          totalReferences: 4,
          directReferenceCount: 2,
          editableDirectReferenceCount: 1,
          exactReferenceCount: 1,
          inferredOrBetterReferenceCount: 3,
          hasExpandedReferences: true,
          hasStyleDependencyReferences: true,
          hasAnyReferences: true,
        }),
      },
    );

    expect(result).not.toBeNull();
    expect(result?.usageSummary).toMatchObject({
      totalReferences: 4,
      directReferenceCount: 2,
      hasExpandedReferences: true,
      hasStyleDependencyReferences: true,
      hasAnyReferences: true,
    });
  });

  it("falls back to semantic selector usage when rust payload is unavailable", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/ws/src/App.tsx", [
      semanticSiteAt("file:///fake/ws/src/App.tsx", "indicator", 10, SCSS_PATH),
    ]);
    const deps = makeBaseDeps({
      selectorMapForPath: () => new Map([["indicator", infoAtLine("indicator", 5)]]),
      workspaceRoot: "/fake/ws",
      semanticReferenceIndex,
    });

    const result = resolveStyleSelectorHoverResult(
      {
        filePath: SCSS_PATH,
        line: 5,
        character: 3,
      },
      deps,
      {
        env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
        readRustSelectorUsagePayloadForWorkspaceTarget: () => null,
      },
    );

    expect(result).not.toBeNull();
    expect(result?.usageSummary).toMatchObject({
      totalReferences: 1,
      directReferenceCount: 1,
      hasExpandedReferences: false,
      hasStyleDependencyReferences: false,
      hasAnyReferences: true,
    });
  });
});
