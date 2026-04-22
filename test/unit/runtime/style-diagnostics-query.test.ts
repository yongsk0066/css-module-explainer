import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { resolveStyleDiagnosticFindings } from "../../../server/engine-host-node/src/style-diagnostics-query";
import { infoAtLine, semanticSiteAt } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

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
});
