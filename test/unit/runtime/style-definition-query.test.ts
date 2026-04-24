import { describe, expect, it } from "vitest";
import { AliasResolver } from "../../../server/engine-core-ts/src/core/cx/alias-resolver";
import type { StyleDocumentHIR } from "../../../server/engine-core-ts/src/core/hir/style-types";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { resolveStyleDefinitionTargets } from "../../../server/engine-host-node/src/style-definition-query";

const BUTTON_PATH = "/fake/workspace/src/Button.module.scss";
const BASE_PATH = "/fake/workspace/src/Base.module.scss";
const THEME_PATH = "/fake/workspace/src/theme.module.scss";
const TOKENS_PATH = "/fake/workspace/src/tokens.module.scss";
const TOKENS_PARTIAL_PATH = "/fake/workspace/src/_tokens.module.scss";
const EMPTY_ALIAS_RESOLVER = new AliasResolver("/fake/workspace", {});

describe("resolveStyleDefinitionTargets", () => {
  it("resolves cross-file composes tokens to target selectors", () => {
    const buttonScss = `
.button {
  composes: base from './Base.module.scss';
  color: red;
}
`;
    const baseScss = `
.base {
  color: blue;
}
`;
    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 2, character: 13 },
      depsForDocuments([
        parseStyleDocument(buttonScss, BUTTON_PATH),
        parseStyleDocument(baseScss, BASE_PATH),
      ]),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetFilePath: BASE_PATH,
      targetSelectionRange: {
        start: { line: 1, character: 1 },
        end: { line: 1, character: 5 },
      },
    });
  });

  it("resolves animation-name tokens to same-file keyframes", () => {
    const scss = `@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.box {
  animation: fade 1s linear;
}
`;
    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 6, character: 15 },
      depsForDocuments([parseStyleDocument(scss, BUTTON_PATH)]),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetFilePath: BUTTON_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 11 },
        end: { line: 0, character: 15 },
      },
    });
  });

  it("resolves imported value references to source value declarations", () => {
    const buttonScss = `@value primary from "./tokens.module.scss";

.button {
  color: primary;
}
`;
    const tokensScss = `@value primary: #ff3355;`;
    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 10 },
      depsForDocuments([
        parseStyleDocument(buttonScss, BUTTON_PATH),
        parseStyleDocument(tokensScss, TOKENS_PATH),
      ]),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetFilePath: TOKENS_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 14 },
      },
    });
  });

  it("resolves Sass @use source tokens to module files with partial candidates", () => {
    const buttonScss = `@use "./tokens.module";

.button {
  color: tokens.$gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 0, character: 10 },
      depsForDocuments([
        parseStyleDocument(buttonScss, BUTTON_PATH),
        parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
      ]),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      originRange: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 21 },
      },
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
    });
  });

  it("resolves Sass @use source tokens through path aliases", () => {
    const buttonScss = `@use "@styles/tokens.module" as tokens;

.button {
  color: tokens.$gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 0, character: 10 },
      depsForDocuments(
        [
          parseStyleDocument(buttonScss, BUTTON_PATH),
          parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
        ],
        {
          aliasResolver: new AliasResolver("/fake/workspace", {
            "@styles": "src",
          }),
        },
      ),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      originRange: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 27 },
      },
      targetFilePath: TOKENS_PARTIAL_PATH,
    });
  });

  it("resolves Sass @use source tokens through the first existing tsconfig path target", () => {
    const buttonScss = `@use "@styles/tokens.module" as tokens;

.button {
  color: tokens.$gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 0, character: 10 },
      depsForDocuments(
        [
          parseStyleDocument(buttonScss, BUTTON_PATH),
          parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
        ],
        {
          aliasResolver: new AliasResolver(
            "/fake/workspace",
            {},
            {
              basePath: "/fake/workspace",
              paths: {
                "@styles/*": ["missing/*", "src/*"],
              },
            },
          ),
        },
      ),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
    });
  });

  it("does not resolve built-in Sass modules as workspace files", () => {
    const buttonScss = `@use "sass:color";
`;
    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 0, character: 8 },
      depsForDocuments([parseStyleDocument(buttonScss, BUTTON_PATH)]),
    );

    expect(targets).toEqual([]);
  });

  it("resolves namespace-qualified Sass members to declarations in @use targets", () => {
    const buttonScss = `@use "./tokens.module" as tokens;

.button {
  color: tokens.$gap;
  @include tokens.raised;
  border-color: tokens.tone(tokens.$gap);
}
`;
    const tokensScss = `$gap: 1rem;
@mixin raised() {}
@function tone($value) { @return $value; }
`;
    const deps = depsForDocuments([
      parseStyleDocument(buttonScss, BUTTON_PATH),
      parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
    ]);

    const variableTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 18 },
      deps,
    );
    expect(variableTargets).toHaveLength(1);
    expect(variableTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });

    const mixinTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 4, character: 20 },
      deps,
    );
    expect(mixinTargets).toHaveLength(1);
    expect(mixinTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 1, character: 7 },
        end: { line: 1, character: 13 },
      },
    });

    const functionTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 5, character: 25 },
      deps,
    );
    expect(functionTargets).toHaveLength(1);
    expect(functionTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 2, character: 10 },
        end: { line: 2, character: 14 },
      },
    });
  });

  it("resolves wildcard Sass module members to declarations in @use targets", () => {
    const buttonScss = `@use "./tokens.module" as *;

.button {
  color: $gap;
  @include raised;
  border-color: tone($gap);
}
`;
    const tokensScss = `$gap: 1rem;
@mixin raised() {}
@function tone($value) { @return $value; }
`;
    const deps = depsForDocuments([
      parseStyleDocument(buttonScss, BUTTON_PATH),
      parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
    ]);

    const variableTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 10 },
      deps,
    );
    expect(variableTargets).toHaveLength(1);
    expect(variableTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });

    const mixinTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 4, character: 13 },
      deps,
    );
    expect(mixinTargets).toHaveLength(1);
    expect(mixinTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 1, character: 7 },
        end: { line: 1, character: 13 },
      },
    });

    const functionTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 5, character: 18 },
      deps,
    );
    expect(functionTargets).toHaveLength(1);
    expect(functionTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 2, character: 10 },
        end: { line: 2, character: 14 },
      },
    });
  });

  it("resolves Sass members forwarded through @use targets", () => {
    const buttonScss = `@use "./theme.module" as *;

.button {
  color: $gap;
  border-color: tone($gap);
}
`;
    const themeScss = `@forward "./tokens.module";`;
    const tokensScss = `$gap: 1rem;
@function tone($value) { @return $value; }
`;
    const deps = depsForDocuments([
      parseStyleDocument(buttonScss, BUTTON_PATH),
      parseStyleDocument(themeScss, THEME_PATH),
      parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
    ]);

    const variableTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 10 },
      deps,
    );
    expect(variableTargets).toHaveLength(1);
    expect(variableTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });

    const functionTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 4, character: 16 },
      deps,
    );
    expect(functionTargets).toHaveLength(1);
    expect(functionTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 1, character: 10 },
        end: { line: 1, character: 14 },
      },
    });
  });

  it("resolves namespace-qualified Sass members forwarded through @use targets", () => {
    const buttonScss = `@use "./theme.module" as theme;

.button {
  color: theme.$gap;
}
`;
    const themeScss = `@forward "./tokens.module";`;
    const tokensScss = `$gap: 1rem;`;
    const deps = depsForDocuments([
      parseStyleDocument(buttonScss, BUTTON_PATH),
      parseStyleDocument(themeScss, THEME_PATH),
      parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
    ]);

    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 16 },
      deps,
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });
  });

  it("resolves prefixed and filtered Sass members forwarded through @use targets", () => {
    const buttonScss = `@use "./theme.module" as *;

.button {
  color: $theme-gap;
  border-color: theme-tone($theme-gap);
  margin: $theme-secret;
}
`;
    const themeScss = `@forward "./tokens.module" as theme-* show $gap, tone;`;
    const tokensScss = `$gap: 1rem;
$secret: 2rem;
@function tone($value) { @return $value; }
`;
    const deps = depsForDocuments([
      parseStyleDocument(buttonScss, BUTTON_PATH),
      parseStyleDocument(themeScss, THEME_PATH),
      parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
    ]);

    const variableTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 12 },
      deps,
    );
    expect(variableTargets).toHaveLength(1);
    expect(variableTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });

    const functionTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 4, character: 20 },
      deps,
    );
    expect(functionTargets).toHaveLength(1);
    expect(functionTargets[0]).toMatchObject({
      targetFilePath: TOKENS_PARTIAL_PATH,
      targetSelectionRange: {
        start: { line: 2, character: 10 },
        end: { line: 2, character: 14 },
      },
    });

    expect(
      resolveStyleDefinitionTargets({ filePath: BUTTON_PATH, line: 5, character: 12 }, deps),
    ).toEqual([]);
  });

  it("resolves same-file Sass symbol references to declarations", () => {
    const scss = `$gap: 1rem;
@mixin raised() {}
.button {
  color: $gap;
  @include raised();
}
`;
    const deps = depsForDocuments([parseStyleDocument(scss, BUTTON_PATH)]);

    const variableTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 10 },
      deps,
    );
    expect(variableTargets).toHaveLength(1);
    expect(variableTargets[0]).toMatchObject({
      targetFilePath: BUTTON_PATH,
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });

    const mixinTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 4, character: 13 },
      deps,
    );
    expect(mixinTargets).toHaveLength(1);
    expect(mixinTargets[0]).toMatchObject({
      targetFilePath: BUTTON_PATH,
      targetSelectionRange: {
        start: { line: 1, character: 7 },
        end: { line: 1, character: 13 },
      },
    });
  });

  it("resolves Less variable references to the nearest scoped declaration", () => {
    const less = `@gap: 1rem;
.card {
  @gap: 2rem;
  color: @gap;
}
.other {
  color: @gap;
}
`;
    const deps = depsForDocuments([
      parseStyleDocument(less, BUTTON_PATH.replace(".scss", ".less")),
    ]);

    const localTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH.replace(".scss", ".less"), line: 3, character: 10 },
      deps,
    );
    expect(localTargets).toHaveLength(1);
    expect(localTargets[0]).toMatchObject({
      targetSelectionRange: {
        start: { line: 2, character: 2 },
        end: { line: 2, character: 6 },
      },
    });

    const fileScopeTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH.replace(".scss", ".less"), line: 6, character: 10 },
      deps,
    );
    expect(fileScopeTargets).toHaveLength(1);
    expect(fileScopeTargets[0]).toMatchObject({
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });
  });

  it("prefers local Sass variable declarations over same-name file-scope declarations", () => {
    const scss = `$gap: 1rem;
.one {
  $gap: 2rem;
  color: $gap;
}
.two {
  color: $gap;
}
`;
    const deps = depsForDocuments([parseStyleDocument(scss, BUTTON_PATH)]);

    const localTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 3, character: 10 },
      deps,
    );
    expect(localTargets).toHaveLength(1);
    expect(localTargets[0]).toMatchObject({
      targetSelectionRange: {
        start: { line: 2, character: 2 },
        end: { line: 2, character: 6 },
      },
    });

    const fileScopeTargets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 6, character: 10 },
      deps,
    );
    expect(fileScopeTargets).toHaveLength(1);
    expect(fileScopeTargets[0]).toMatchObject({
      targetSelectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    });
  });

  it("prefers local Sass declarations over wildcard module members", () => {
    const buttonScss = `@use "./tokens.module" as *;
$gap: 2rem;

.button {
  color: $gap;
}
`;
    const tokensScss = `$gap: 1rem;`;
    const deps = depsForDocuments([
      parseStyleDocument(buttonScss, BUTTON_PATH),
      parseStyleDocument(tokensScss, TOKENS_PARTIAL_PATH),
    ]);

    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 4, character: 10 },
      deps,
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetFilePath: BUTTON_PATH,
      targetSelectionRange: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 4 },
      },
    });
  });

  it("does not resolve Sass variables to declarations from another local scope", () => {
    const scss = `.one {
  $gap: 1rem;
}
.two {
  color: $gap;
}
`;
    const deps = depsForDocuments([parseStyleDocument(scss, BUTTON_PATH)]);

    const targets = resolveStyleDefinitionTargets(
      { filePath: BUTTON_PATH, line: 4, character: 10 },
      deps,
    );

    expect(targets).toEqual([]);
  });
});

function depsForDocuments(
  documents: readonly StyleDocumentHIR[],
  options: { readonly aliasResolver?: AliasResolver } = {},
) {
  const byPath = new Map(documents.map((document) => [document.filePath, document]));
  return {
    aliasResolver: options.aliasResolver ?? EMPTY_ALIAS_RESOLVER,
    styleDocumentForPath: (filePath: string) => byPath.get(filePath) ?? null,
  };
}
