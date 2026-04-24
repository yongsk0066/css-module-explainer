import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { WorkspaceStyleDependencyGraph } from "../../../server/engine-core-ts/src/core/semantic/style-dependency-graph";
import { checkStyleDocument } from "../../../server/engine-core-ts/src/core/checker";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
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

  it("returns missing imported value module findings once per source module", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithValues = parseStyleDocument(
      `@value colors: "./colors.module.scss";
@value primary, secondary as accent from colors;
.button { color: primary; border-color: accent; }`,
      SCSS_PATH,
    );

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithValues,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
        styleDocumentForPath: () => null,
      },
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "missing-value-module",
          fromSpecifier: "./colors.module.scss",
        }),
      ]),
    );
  });

  it("returns missing imported value when the target module exists without the named value", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithValues = parseStyleDocument(
      `@value primary, secondary as accent from "./colors.module.scss";
.button { color: primary; border-color: accent; }`,
      SCSS_PATH,
    );

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithValues,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
        styleDocumentForPath: (filePath) =>
          filePath === "/fake/colors.module.scss"
            ? parseStyleDocument(`@value primary: #ff3355;`, filePath)
            : null,
      },
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "missing-imported-value",
          importedName: "secondary",
          localName: "accent",
        }),
      ]),
    );
  });

  it("returns missing keyframes findings for unresolved animation names in the same file", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithKeyframes = parseStyleDocument(
      `.button {
  animation: fade 200ms ease-in;
  animation-name: pulse;
}

@keyframes spin {
  from { opacity: 0; }
  to { opacity: 1; }
}`,
      SCSS_PATH,
    );

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithKeyframes,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
      },
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "missing-keyframes",
          animationName: "fade",
        }),
        expect.objectContaining({
          category: "style",
          code: "missing-keyframes",
          animationName: "pulse",
        }),
      ]),
    );
  });

  it("returns missing Sass symbol findings for unresolved same-file symbols", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithSassSymbols = parseStyleDocument(
      `$known: 1rem;
@mixin raised() {}
.button {
  color: $missing;
  @include absent($known);
}`,
      SCSS_PATH,
    );

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithSassSymbols,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
      },
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "missing-sass-symbol",
          selectorName: "button",
          symbolKind: "variable",
          symbolName: "missing",
          symbolRole: "reference",
        }),
        expect.objectContaining({
          category: "style",
          code: "missing-sass-symbol",
          selectorName: "button",
          symbolKind: "mixin",
          symbolName: "absent",
          symbolRole: "include",
        }),
      ]),
    );
  });

  it("returns missing Less variable findings for unresolved same-file variables", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithLessVariables = parseStyleDocument(
      `@known: 1rem;
.button {
  color: @missing;
  margin: @known;
}`,
      "/fake/src/Button.module.less",
    );

    const findings = checkStyleDocument(
      {
        scssPath: "/fake/src/Button.module.less",
        styleDocument: styleDocumentWithLessVariables,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
      },
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "missing-sass-symbol",
          selectorName: "button",
          symbolSyntax: "less",
          symbolKind: "variable",
          symbolName: "missing",
          symbolRole: "reference",
        }),
      ]),
    );
  });

  it("reports Sass variables that only exist in another local scope as missing", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithScopedVariables = parseStyleDocument(
      `.one {
  $gap: 1rem;
}
.two {
  color: $gap;
}`,
      SCSS_PATH,
    );

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithScopedVariables,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
      },
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "missing-sass-symbol",
          selectorName: "two",
          symbolKind: "variable",
          symbolName: "gap",
          symbolRole: "reference",
        }),
      ]),
    );
  });

  it("does not report module-qualified Sass references as same-file missing symbols", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithModuleQualifiedRefs = parseStyleDocument(
      `@use "./tokens" as tokens;
@mixin raised { box-shadow: none; }
@function tone($value) { @return $value; }
.button {
  color: tokens.$gap;
  @include tokens.raised;
  border-color: tokens.tone(tokens.$gap);
}`,
      SCSS_PATH,
    );

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithModuleQualifiedRefs,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
      },
    );

    expect(findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-sass-symbol",
        }),
      ]),
    );
  });
});
