import { describe, expect, it } from "vitest";
import type { StyleDependencyGraph } from "../../../server/engine-core-ts/src/core/semantic";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { resolveUnusedStyleSelectors } from "../../../server/engine-host-node/src/style-module-usage-query";
import type { StyleSemanticGraphSummaryV0 } from "../../../server/engine-host-node/src/style-semantic-graph-query-backend";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";

describe("style module usage query", () => {
  it("uses rust selector-usage payloads to decide unused selectors", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([
        ["indicator", infoAtLine("indicator", 1)],
        ["active", infoAtLine("active", 3)],
      ]),
    );
    const deps = makeBaseDeps({
      selectorMapForPath: () =>
        new Map([
          ["indicator", infoAtLine("indicator", 1)],
          ["active", infoAtLine("active", 3)],
        ]),
      workspaceRoot: "/fake/ws",
    });

    const unused = resolveUnusedStyleSelectors({ scssPath: SCSS_PATH, styleDocument }, deps, {
      env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
      readRustSelectorUsagePayloadForWorkspaceTarget: (_args, _deps, _filePath, canonicalName) =>
        canonicalName === "indicator"
          ? {
              canonicalName,
              totalReferences: 2,
              directReferenceCount: 1,
              editableDirectReferenceCount: 1,
              exactReferenceCount: 1,
              inferredOrBetterReferenceCount: 2,
              hasExpandedReferences: true,
              hasStyleDependencyReferences: false,
              hasAnyReferences: true,
            }
          : {
              canonicalName,
              totalReferences: 0,
              directReferenceCount: 0,
              editableDirectReferenceCount: 0,
              exactReferenceCount: 0,
              inferredOrBetterReferenceCount: 0,
              hasExpandedReferences: false,
              hasStyleDependencyReferences: false,
              hasAnyReferences: false,
            },
    });

    expect(unused).toEqual([
      expect.objectContaining({
        canonicalName: "active",
      }),
    ]);
  });

  it("does not precompute the semantic fallback when rust payloads cover all selectors", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([
        ["indicator", infoAtLine("indicator", 1)],
        ["active", infoAtLine("active", 3)],
      ]),
    );
    const deps = makeBaseDeps({
      selectorMapForPath: () =>
        new Map([
          ["indicator", infoAtLine("indicator", 1)],
          ["active", infoAtLine("active", 3)],
        ]),
      styleDependencyGraph: throwingStyleDependencyGraph(),
      workspaceRoot: "/fake/ws",
    });

    const unused = resolveUnusedStyleSelectors({ scssPath: SCSS_PATH, styleDocument }, deps, {
      env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
      readRustSelectorUsagePayloadForWorkspaceTarget: (_args, _deps, _filePath, canonicalName) => ({
        canonicalName,
        totalReferences: canonicalName === "indicator" ? 1 : 0,
        directReferenceCount: canonicalName === "indicator" ? 1 : 0,
        editableDirectReferenceCount: canonicalName === "indicator" ? 1 : 0,
        exactReferenceCount: canonicalName === "indicator" ? 1 : 0,
        inferredOrBetterReferenceCount: canonicalName === "indicator" ? 1 : 0,
        hasExpandedReferences: false,
        hasStyleDependencyReferences: false,
        hasAnyReferences: canonicalName === "indicator",
      }),
    });

    expect(unused).toEqual([
      expect.objectContaining({
        canonicalName: "active",
      }),
    ]);
  });

  it("uses rust style semantic graph references before selector-usage payloads", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([
        ["indicator", infoAtLine("indicator", 1)],
        ["active", infoAtLine("active", 3)],
      ]),
    );
    const deps = makeBaseDeps({
      selectorMapForPath: () =>
        new Map([
          ["indicator", infoAtLine("indicator", 1)],
          ["active", infoAtLine("active", 3)],
        ]),
      workspaceRoot: "/fake/ws",
    });

    const unused = resolveUnusedStyleSelectors({ scssPath: SCSS_PATH, styleDocument }, deps, {
      env: { CME_SELECTED_QUERY_BACKEND: "rust-selected-query" } as NodeJS.ProcessEnv,
      readRustStyleSemanticGraphForWorkspaceTarget: () => makeReferenceGraph(),
      readRustSelectorUsagePayloadForWorkspaceTarget: () => {
        throw new Error("unexpected selector-usage fallback");
      },
    });

    expect(unused).toEqual([
      expect.objectContaining({
        canonicalName: "active",
      }),
    ]);
  });

  it("falls back to semantic usage summary when rust payloads are unavailable", () => {
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([
        ["indicator", infoAtLine("indicator", 1)],
        ["active", infoAtLine("active", 3)],
      ]),
    );
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///fake/ws/src/App.tsx", [
      semanticSiteAt("file:///fake/ws/src/App.tsx", "indicator", 8, SCSS_PATH),
    ]);
    const deps = makeBaseDeps({
      selectorMapForPath: () =>
        new Map([
          ["indicator", infoAtLine("indicator", 1)],
          ["active", infoAtLine("active", 3)],
        ]),
      workspaceRoot: "/fake/ws",
      semanticReferenceIndex,
    });

    const unused = resolveUnusedStyleSelectors({ scssPath: SCSS_PATH, styleDocument }, deps, {
      env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
      readRustSelectorUsagePayloadForWorkspaceTarget: () => null,
    });

    expect(unused).toEqual([
      expect.objectContaining({
        canonicalName: "active",
      }),
    ]);
  });
});

function throwingStyleDependencyGraph(): StyleDependencyGraph {
  return {
    record: () => {
      throw new Error("unexpected semantic fallback");
    },
    forget: () => {},
    forgetWithinRoot: () => {},
    getIncoming: () => [],
    getOutgoing: () => [],
    getIncomingSassModuleMemberRefs: () => [],
  };
}

function makeReferenceGraph(): StyleSemanticGraphSummaryV0 {
  return {
    schemaVersion: "0",
    product: "omena-semantic.style-semantic-graph",
    language: "scss",
    parserFacts: {},
    semanticFacts: {},
    selectorIdentityEngine: {
      schemaVersion: "0",
      product: "omena-semantic.selector-identity",
      canonicalIdCount: 2,
      canonicalIds: [
        {
          canonicalId: "selector:indicator",
          localName: "indicator",
          identityKind: "localClass",
          rewriteSafety: "safe",
          blockers: [],
        },
        {
          canonicalId: "selector:active",
          localName: "active",
          identityKind: "localClass",
          rewriteSafety: "safe",
          blockers: [],
        },
      ],
      rewriteSafety: {
        allCanonicalIdsRewriteSafe: true,
        safeCanonicalIds: ["selector:indicator", "selector:active"],
        blockedCanonicalIds: [],
        blockers: [],
      },
    },
    selectorReferenceEngine: {
      schemaVersion: "0",
      product: "omena-semantic.selector-references",
      stylePath: SCSS_PATH,
      selectorCount: 2,
      referencedSelectorCount: 1,
      unreferencedSelectorCount: 1,
      totalReferenceSites: 1,
      selectors: [
        makeSelectorReferenceSummary("indicator", true),
        makeSelectorReferenceSummary("active", false),
      ],
    },
    sourceInputEvidence: {},
    promotionEvidence: {},
    losslessCstContract: {},
  };
}

function makeSelectorReferenceSummary(localName: string, hasAnyReferences: boolean) {
  const referenceCount = hasAnyReferences ? 1 : 0;
  return {
    canonicalId: `selector:${localName}`,
    filePath: SCSS_PATH,
    localName,
    totalReferences: referenceCount,
    directReferenceCount: referenceCount,
    editableDirectReferenceCount: referenceCount,
    exactReferenceCount: referenceCount,
    inferredOrBetterReferenceCount: referenceCount,
    hasExpandedReferences: false,
    hasStyleDependencyReferences: false,
    hasAnyReferences,
    sites: hasAnyReferences
      ? [
          {
            filePath: "/fake/ws/src/App.tsx",
            range: {
              start: { line: 8, character: 10 },
              end: { line: 8, character: 19 },
            },
            expansion: "direct",
            referenceKind: "source",
          },
        ]
      : [],
    editableDirectSites: hasAnyReferences
      ? [
          {
            filePath: "/fake/ws/src/App.tsx",
            range: {
              start: { line: 8, character: 10 },
              end: { line: 8, character: 19 },
            },
            className: localName,
          },
        ]
      : [],
  };
}
