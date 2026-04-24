import { describe, expect, it } from "vitest";
import type { StyleDocumentHIR } from "../../../server/engine-core-ts/src/core/hir/style-types";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { WorkspaceStyleDependencyGraph } from "../../../server/engine-core-ts/src/core/semantic/style-dependency-graph";
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

  it("returns same-file Sass symbol references from a declaration cursor", () => {
    const filePath = "/fake/src/Button.module.scss";
    const scss = `$gap: 1rem;
.button {
  color: $gap;
  margin: $gap;
}
`;
    const styleDocument = parseStyleDocument(scss, filePath);

    const result = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: 0,
        character: 1,
        includeDeclaration: true,
        styleDocument,
      },
      makeDeps({ styleDocumentForPath: styleDocumentMap([styleDocument]) }),
    );

    expect(result).toHaveLength(3);
    expect(result.every((location) => location.uri === "file:///fake/src/Button.module.scss")).toBe(
      true,
    );
    expect(result.map((location) => location.range.start.line)).toEqual([0, 2, 3]);
  });

  it("keeps local Sass variable references separate from same-name file-scope variables", () => {
    const filePath = "/fake/src/Button.module.scss";
    const scss = `$gap: 1rem;
.one {
  $gap: 2rem;
  color: $gap;
}
.two {
  color: $gap;
}
`;
    const styleDocument = parseStyleDocument(scss, filePath);

    const localResult = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: 2,
        character: 3,
        includeDeclaration: true,
        styleDocument,
      },
      makeDeps({ styleDocumentForPath: styleDocumentMap([styleDocument]) }),
    );
    expect(localResult.map((location) => location.range.start.line)).toEqual([2, 3]);

    const fileScopeResult = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: 0,
        character: 1,
        includeDeclaration: true,
        styleDocument,
      },
      makeDeps({ styleDocumentForPath: styleDocumentMap([styleDocument]) }),
    );
    expect(fileScopeResult.map((location) => location.range.start.line)).toEqual([0, 6]);
  });

  it("returns namespace-qualified Sass member references with the target declaration", () => {
    const filePath = "/fake/src/Button.module.scss";
    const tokensPath = "/fake/src/tokens.module.scss";
    const buttonScss = `@use "./tokens.module" as tokens;

.button {
  color: tokens.$gap;
  margin: tokens.$gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const styleDocument = parseStyleDocument(buttonScss, filePath);
    const targetDocument = parseStyleDocument(tokensScss, tokensPath);

    const result = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: 3,
        character: 18,
        includeDeclaration: true,
        styleDocument,
      },
      makeDeps({ styleDocumentForPath: styleDocumentMap([styleDocument, targetDocument]) }),
    );

    expect(result).toEqual([
      {
        uri: "file:///fake/src/tokens.module.scss",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
      },
      {
        uri: "file:///fake/src/Button.module.scss",
        range: {
          start: { line: 3, character: 16 },
          end: { line: 3, character: 20 },
        },
      },
      {
        uri: "file:///fake/src/Button.module.scss",
        range: {
          start: { line: 4, character: 17 },
          end: { line: 4, character: 21 },
        },
      },
    ]);
  });

  it("returns wildcard Sass module member references with the target declaration", () => {
    const filePath = "/fake/src/Button.module.scss";
    const tokensPath = "/fake/src/tokens.module.scss";
    const buttonScss = `@use "./tokens.module" as *;

.button {
  color: $gap;
  margin: $gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const styleDocument = parseStyleDocument(buttonScss, filePath);
    const targetDocument = parseStyleDocument(tokensScss, tokensPath);

    const result = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: 3,
        character: 10,
        includeDeclaration: true,
        styleDocument,
      },
      makeDeps({ styleDocumentForPath: styleDocumentMap([styleDocument, targetDocument]) }),
    );

    expect(result).toEqual([
      {
        uri: "file:///fake/src/tokens.module.scss",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
      },
      {
        uri: "file:///fake/src/Button.module.scss",
        range: {
          start: { line: 3, character: 9 },
          end: { line: 3, character: 13 },
        },
      },
      {
        uri: "file:///fake/src/Button.module.scss",
        range: {
          start: { line: 4, character: 10 },
          end: { line: 4, character: 14 },
        },
      },
    ]);
  });

  it("returns namespace-qualified Sass member references from the target declaration cursor", () => {
    const filePath = "/fake/src/Button.module.scss";
    const tokensPath = "/fake/src/tokens.module.scss";
    const buttonScss = `@use "./tokens.module" as tokens;

.button {
  color: tokens.$gap;
  margin: tokens.$gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const styleDocument = parseStyleDocument(buttonScss, filePath);
    const targetDocument = parseStyleDocument(tokensScss, tokensPath);
    const styleDependencyGraph = new WorkspaceStyleDependencyGraph();
    styleDependencyGraph.record(filePath, styleDocument, {
      resolveSassModuleUseTargetFilePath: () => tokensPath,
    });

    const result = resolveStyleReferencesAtCursor(
      {
        filePath: tokensPath,
        line: 0,
        character: 1,
        includeDeclaration: true,
        styleDocument: targetDocument,
      },
      makeDeps({
        styleDocumentForPath: styleDocumentMap([styleDocument, targetDocument]),
        styleDependencyGraph,
      }),
    );

    expect(result.map((location) => location.uri)).toEqual([
      "file:///fake/src/tokens.module.scss",
      "file:///fake/src/Button.module.scss",
      "file:///fake/src/Button.module.scss",
    ]);
    expect(result.map((location) => location.range.start.line)).toEqual([0, 3, 4]);
  });

  it("returns wildcard Sass module member references from the target declaration cursor", () => {
    const filePath = "/fake/src/Button.module.scss";
    const tokensPath = "/fake/src/tokens.module.scss";
    const buttonScss = `@use "./tokens.module" as *;

.button {
  color: $gap;
  margin: $gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const styleDocument = parseStyleDocument(buttonScss, filePath);
    const targetDocument = parseStyleDocument(tokensScss, tokensPath);
    const styleDependencyGraph = new WorkspaceStyleDependencyGraph();
    styleDependencyGraph.record(filePath, styleDocument, {
      resolveSassModuleUseTargetFilePath: () => tokensPath,
    });

    const result = resolveStyleReferencesAtCursor(
      {
        filePath: tokensPath,
        line: 0,
        character: 1,
        includeDeclaration: true,
        styleDocument: targetDocument,
      },
      makeDeps({
        styleDocumentForPath: styleDocumentMap([styleDocument, targetDocument]),
        styleDependencyGraph,
      }),
    );

    expect(result.map((location) => location.uri)).toEqual([
      "file:///fake/src/tokens.module.scss",
      "file:///fake/src/Button.module.scss",
      "file:///fake/src/Button.module.scss",
    ]);
    expect(result.map((location) => location.range.start.line)).toEqual([0, 3, 4]);
  });
});

function styleDocumentMap(documents: readonly StyleDocumentHIR[]) {
  const byPath = new Map(documents.map((document) => [document.filePath, document]));
  return (filePath: string) => byPath.get(filePath) ?? null;
}
