import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import type { ProviderDeps } from "../../../server/lsp-server/src/providers/cursor-dispatch";
import { resolveStyleReferenceLenses } from "../../../server/engine-host-node/src/style-reference-lens-query";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return makeBaseDeps({
    selectorMapForPath: () =>
      new Map([
        ["indicator", infoAtLine("indicator", 5)],
        ["active", infoAtLine("active", 10)],
      ]),
    workspaceRoot: "/fake",
    ...overrides,
  });
}

describe("resolveStyleReferenceLenses", () => {
  it("returns an empty list when no selector has references", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      "/fake/src/Button.module.scss",
      new Map([
        ["indicator", infoAtLine("indicator", 5)],
        ["active", infoAtLine("active", 10)],
      ]),
    );

    expect(
      resolveStyleReferenceLenses("/fake/src/Button.module.scss", styleDocument, makeDeps()),
    ).toEqual([]);
  });

  it("returns code-lens summaries for referenced selectors", () => {
    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 10, "/fake/src/Button.module.scss"),
    ]);
    const styleDocument = buildStyleDocumentFromSelectorMap(
      "/fake/src/Button.module.scss",
      new Map([
        ["indicator", infoAtLine("indicator", 5)],
        ["active", infoAtLine("active", 10)],
      ]),
    );

    const result = resolveStyleReferenceLenses(
      "/fake/src/Button.module.scss",
      styleDocument,
      makeDeps({ semanticReferenceIndex: idx }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      position: { line: 5, character: 1 },
      title: "1 reference",
    });
    expect(result[0]!.locations).toHaveLength(1);
    expect(result[0]!.locations[0]!.uri).toBe("file:///a.tsx");
  });

  it("uses rust selector-usage payloads for the lens title summary and locations", () => {
    const idx = new WorkspaceSemanticWorkspaceReferenceIndex();
    idx.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 10, "/fake/src/Button.module.scss"),
    ]);
    const styleDocument = buildStyleDocumentFromSelectorMap(
      "/fake/src/Button.module.scss",
      new Map([
        ["indicator", infoAtLine("indicator", 5)],
        ["active", infoAtLine("active", 10)],
      ]),
    );

    const result = resolveStyleReferenceLenses(
      "/fake/src/Button.module.scss",
      styleDocument,
      makeDeps({ semanticReferenceIndex: idx }),
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
          allSites: [
            {
              filePath: "/fake/src/App.tsx",
              range: {
                start: { line: 12, character: 8 },
                end: { line: 12, character: 17 },
              },
              expansion: "direct",
              referenceKind: "source",
            },
            {
              filePath: "/fake/src/Other.module.scss",
              range: {
                start: { line: 3, character: 1 },
                end: { line: 3, character: 10 },
              },
              expansion: "direct",
              referenceKind: "styleDependency",
            },
          ],
        }),
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("4 references (2 direct, composed, dynamic)");
    expect(result[0]?.locations).toEqual([
      {
        uri: "file:///fake/src/App.tsx",
        range: {
          start: { line: 12, character: 8 },
          end: { line: 12, character: 17 },
        },
      },
      {
        uri: "file:///fake/src/Other.module.scss",
        range: {
          start: { line: 3, character: 1 },
          end: { line: 3, character: 10 },
        },
      },
    ]);
  });
});
