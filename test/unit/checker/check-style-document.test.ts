import { describe, expect, it } from "vitest";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/engine-core-ts/src/core/semantic/workspace-reference-index";
import { WorkspaceStyleDependencyGraph } from "../../../server/engine-core-ts/src/core/semantic/style-dependency-graph";
import { checkStyleDocument } from "../../../server/engine-core-ts/src/core/checker";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { info, semanticSiteAt } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/Button.module.scss";
const UTILS_PATH = "/fake/_utils.scss";
const PACKAGE_TOKENS_ROOT = "/fake/node_modules/@design/tokens";
const PACKAGE_TOKENS_JSON_PATH = `${PACKAGE_TOKENS_ROOT}/package.json`;
const PACKAGE_TOKENS_INDEX_PATH = `${PACKAGE_TOKENS_ROOT}/src/index.scss`;
const PACKAGE_TOKENS_COLORS_ENTRY_PATH = `${PACKAGE_TOKENS_ROOT}/src/colors.scss`;
const PACKAGE_TOKENS_TYPOGRAPHY_ENTRY_PATH = `${PACKAGE_TOKENS_ROOT}/src/typography.scss`;
const PACKAGE_VARIABLES_CSS_PATH = `${PACKAGE_TOKENS_ROOT}/variables.css`;

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

  it("returns missing custom property findings for unresolved indexed token refs", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithCustomProperties = parseStyleDocument(
      `:root { --brand: #0af; }
.button {
  color: var(--missing);
}`,
      SCSS_PATH,
    );

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithCustomProperties,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
      },
      { includeUnusedSelectors: false },
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "style",
          code: "missing-custom-property",
          propertyName: "--missing",
        }),
      ]),
    );
  });

  it("does not report custom properties resolved through the workspace graph", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithCustomProperties = parseStyleDocument(
      `.button {
  color: var(--brand);
}`,
      SCSS_PATH,
    );
    const tokenPath = "/fake/tokens.module.css";
    const tokenDocument = parseStyleDocument(`:root { --brand: #0af; }`, tokenPath);
    const styleDependencyGraph = new WorkspaceStyleDependencyGraph();
    styleDependencyGraph.record(tokenPath, tokenDocument);

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithCustomProperties,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph,
      },
      { includeUnusedSelectors: false },
    );

    expect(findings.filter((finding) => finding.code === "missing-custom-property")).toEqual([]);
  });

  it("does not report package-root CSS custom properties resolved through package.json style entries", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const styleDocumentWithCustomProperties = parseStyleDocument(
      `@use "@design/tokens";

.button {
  color: var(--color-gray-700);
}`,
      SCSS_PATH,
    );
    const tokenDocument = parseStyleDocument(
      `:root { --color-gray-700: #767678; }`,
      PACKAGE_VARIABLES_CSS_PATH,
    );
    const byPath = new Map([
      [SCSS_PATH, styleDocumentWithCustomProperties],
      [PACKAGE_VARIABLES_CSS_PATH, tokenDocument],
    ]);

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: styleDocumentWithCustomProperties,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
        styleDocumentForPath: (filePath) => byPath.get(filePath) ?? null,
        readFile: (filePath) =>
          filePath === PACKAGE_TOKENS_JSON_PATH ? `{"style":"variables.css"}` : null,
      },
      { includeUnusedSelectors: false },
    );

    expect(findings.filter((finding) => finding.code === "missing-custom-property")).toEqual([]);
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

  it("does not report Sass symbols forwarded from a package root through a local utility module", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const buttonDocument = parseStyleDocument(
      `@use "utils" as *;

.title {
  color: $ds_gray700;
  @include ds_typography16;
}`,
      SCSS_PATH,
    );
    const utilsDocument = parseStyleDocument(`@forward "@design/tokens" as ds_*;`, UTILS_PATH);
    const tokensDocument = parseStyleDocument(
      `$gray700: #767678;
@mixin typography16 {}`,
      PACKAGE_TOKENS_INDEX_PATH,
    );
    const byPath = new Map([
      [SCSS_PATH, buttonDocument],
      [UTILS_PATH, utilsDocument],
      [PACKAGE_TOKENS_INDEX_PATH, tokensDocument],
    ]);

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: buttonDocument,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
        styleDocumentForPath: (filePath) => byPath.get(filePath) ?? null,
        readFile: (filePath) =>
          filePath === PACKAGE_TOKENS_JSON_PATH ? `{"sass":"src/index.scss"}` : null,
      },
      { includeUnusedSelectors: false },
    );

    expect(findings.filter((finding) => finding.code === "missing-sass-symbol")).toEqual([]);
  });

  it("does not report Sass symbols forwarded from package export patterns", () => {
    const semanticReferenceIndex = new WorkspaceSemanticWorkspaceReferenceIndex();
    const buttonDocument = parseStyleDocument(
      `@use "utils" as *;

.title {
  color: $ds_gray700;
  @include ds_typography16;
}`,
      SCSS_PATH,
    );
    const utilsDocument = parseStyleDocument(
      `@forward "@design/tokens/colors" as ds_*;
@forward "@design/tokens/typography" as ds_*;`,
      UTILS_PATH,
    );
    const colorsDocument = parseStyleDocument(
      `$gray700: #767678;`,
      PACKAGE_TOKENS_COLORS_ENTRY_PATH,
    );
    const typographyDocument = parseStyleDocument(
      `@mixin typography16 {}`,
      PACKAGE_TOKENS_TYPOGRAPHY_ENTRY_PATH,
    );
    const byPath = new Map([
      [SCSS_PATH, buttonDocument],
      [UTILS_PATH, utilsDocument],
      [PACKAGE_TOKENS_COLORS_ENTRY_PATH, colorsDocument],
      [PACKAGE_TOKENS_TYPOGRAPHY_ENTRY_PATH, typographyDocument],
    ]);

    const findings = checkStyleDocument(
      {
        scssPath: SCSS_PATH,
        styleDocument: buttonDocument,
      },
      {
        semanticReferenceIndex,
        styleDependencyGraph: new WorkspaceStyleDependencyGraph(),
        styleDocumentForPath: (filePath) => byPath.get(filePath) ?? null,
        readFile: (filePath) =>
          filePath === PACKAGE_TOKENS_JSON_PATH
            ? `{"exports":{"./*":{"sass":"./src/*.scss"}}}`
            : null,
      },
      { includeUnusedSelectors: false },
    );

    expect(findings.filter((finding) => finding.code === "missing-sass-symbol")).toEqual([]);
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
