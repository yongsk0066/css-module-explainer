import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import { WorkspaceStyleDependencyGraph } from "../../../server/src/core/semantic/style-dependency-graph";
import { checkStyleDocument } from "../../../server/src/core/checker";
import { info, semanticSiteAt } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/Button.module.scss";

function styleDocument(selectors: ReadonlyMap<string, ReturnType<typeof info>>) {
  return buildStyleDocumentFromSelectorMap(SCSS_PATH, selectors);
}

describe("checkStyleDocument", () => {
  it("returns unused selector findings without LSP shaping", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    semanticReferenceIndex.record("file:///a.tsx", [
      semanticSiteAt("file:///a.tsx", "indicator", 5, SCSS_PATH),
    ]);

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocument(
          new Map([
            ["indicator", info("indicator")],
            ["active", info("active")],
          ]),
        ),
      },
      { semanticReferenceIndex },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: "style",
      code: "unused-selector",
      canonicalName: "active",
    });
  });

  it("returns unresolved composed selector findings", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: buildStyleDocumentFromSelectorMap(
          SCSS_PATH,
          new Map([
            [
              "button",
              {
                ...info("button"),
                composes: [{ classNames: ["base"], from: "./Base.module.scss" }],
              },
            ],
          ]),
        ),
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
        styleDocumentForPath: () =>
          buildStyleDocumentFromSelectorMap(
            "/fake/Base.module.scss",
            new Map([["other", info("other")]]),
          ),
      },
    );

    expect(findings).toHaveLength(2);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "unused-selector",
          canonicalName: "button",
        }),
        expect.objectContaining({
          category: "style",
          code: "missing-composed-selector",
          className: "base",
        }),
      ]),
    );
  });
});
