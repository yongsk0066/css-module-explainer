import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import type { ProviderDeps } from "../../../server/lsp-server/src/providers/cursor-dispatch";
import { resolveStyleReferencesAtCursor } from "../../../server/engine-host-node/src/style-references-query";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  return makeBaseDeps({
    selectorMapForPath: () => new Map([["indicator", infoAtLine("indicator", 5)]]),
    workspaceRoot: "/fake",
    ...overrides,
  });
}

describe("resolveStyleReferencesAtCursor", () => {
  it("returns selector reference locations from the semantic index by default", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSiteAt("file:///fake/src/App.tsx", "indicator", 10, "/fake/src/Button.module.scss"),
    ]);
    const styleDocument = buildStyleDocumentFromSelectorMap(
      "/fake/src/Button.module.scss",
      new Map([["indicator", infoAtLine("indicator", 5)]]),
    );

    const result = resolveStyleReferencesAtCursor(
      {
        filePath: "/fake/src/Button.module.scss",
        line: 5,
        character: 3,
        includeDeclaration: true,
        styleDocument,
      },
      makeDeps({ semanticReferenceIndex }),
    );

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

  it("uses rust selector-usage payloads for selector reference locations", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/src/App.tsx", [
      semanticSiteAt("file:///fake/src/App.tsx", "indicator", 10, "/fake/src/Button.module.scss"),
    ]);
    const styleDocument = buildStyleDocumentFromSelectorMap(
      "/fake/src/Button.module.scss",
      new Map([["indicator", infoAtLine("indicator", 5)]]),
    );

    const result = resolveStyleReferencesAtCursor(
      {
        filePath: "/fake/src/Button.module.scss",
        line: 5,
        character: 3,
        includeDeclaration: true,
        styleDocument,
      },
      makeDeps({ semanticReferenceIndex }),
      {
        env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
        readRustSelectorUsagePayloadForWorkspaceTarget: () => ({
          canonicalName: "indicator",
          totalReferences: 2,
          directReferenceCount: 1,
          editableDirectReferenceCount: 1,
          exactReferenceCount: 1,
          inferredOrBetterReferenceCount: 1,
          hasExpandedReferences: true,
          hasStyleDependencyReferences: true,
          hasAnyReferences: true,
          allSites: [
            {
              filePath: "/fake/src/App.tsx",
              range: {
                start: { line: 10, character: 10 },
                end: { line: 10, character: 19 },
              },
              expansion: "direct",
              referenceKind: "source",
            },
            {
              filePath: "/fake/src/Other.module.scss",
              range: {
                start: { line: 2, character: 1 },
                end: { line: 2, character: 10 },
              },
              expansion: "direct",
              referenceKind: "styleDependency",
            },
          ],
        }),
      },
    );

    expect(result).toEqual([
      {
        uri: "file:///fake/src/App.tsx",
        range: {
          start: { line: 10, character: 10 },
          end: { line: 10, character: 19 },
        },
      },
      {
        uri: "file:///fake/src/Other.module.scss",
        range: {
          start: { line: 2, character: 1 },
          end: { line: 2, character: 10 },
        },
      },
    ]);
  });
});
