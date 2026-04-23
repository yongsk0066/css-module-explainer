import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { resolveStyleDiagnosticFindings } from "../../../server/engine-host-node/src/style-diagnostics-query";
import { infoAtLine, makeBaseDeps, semanticSiteAt } from "../../_fixtures/test-helpers";
import {
  buildStyleDocumentFromSelectorMap,
  makeStyleDocumentFixture,
  makeTestSelector,
} from "../../_fixtures/style-documents";

describe("resolveStyleDiagnosticFindings", () => {
  it("returns style checker findings through the host boundary", () => {
    const scssPath = "/fake/Button.module.scss";
    const styleDocument = buildStyleDocumentFromSelectorMap(
      scssPath,
      new Map([
        ["indicator", infoAtLine("indicator", 1)],
        ["active", infoAtLine("active", 3)],
      ]),
    );
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 5, scssPath),
    ]);

    const findings = resolveStyleDiagnosticFindings(
      { scssPath, styleDocument },
      { semanticReferenceIndex },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "unused-selector",
    });
  });

  it("can source unused-selector findings from rust selector-usage payloads", () => {
    const scssPath = "/fake/Button.module.scss";
    const styleDocument = buildStyleDocumentFromSelectorMap(
      scssPath,
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
      workspaceRoot: "/fake",
    });

    const findings = resolveStyleDiagnosticFindings(
      { scssPath, styleDocument },
      {
        analysisCache: deps.analysisCache,
        semanticReferenceIndex: deps.semanticReferenceIndex,
        styleDependencyGraph: deps.styleDependencyGraph,
        styleDocumentForPath: deps.styleDocumentForPath,
        typeResolver: deps.typeResolver,
        workspaceRoot: deps.workspaceRoot,
        settings: deps.settings,
      },
      {
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
      },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "unused-selector",
      canonicalName: "active",
    });
  });

  it("does not fall back to current unused-selector diagnostics when rust deps are incomplete", () => {
    const scssPath = "/fake/Button.module.scss";
    const styleDocument = makeStyleDocumentFixture(scssPath, [
      makeTestSelector("indicator", 1),
      makeTestSelector("active", 3),
      makeTestSelector("composed", 5, {
        composes: [{ classNames: ["missing"], from: "./Other.module.scss" }],
      }),
    ]);
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 5, scssPath),
    ]);

    const findings = resolveStyleDiagnosticFindings(
      { scssPath, styleDocument },
      {
        semanticReferenceIndex,
        styleDocumentForPath: () => null,
      },
      {
        env: { CME_SELECTED_QUERY_BACKEND: "rust-selector-usage" } as NodeJS.ProcessEnv,
      },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "missing-composed-module",
    });
  });
});
