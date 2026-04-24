import { describe, expect, it } from "vitest";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { resolveStyleCompletionItems } from "../../../server/engine-host-node/src/style-completion-query";

const SCSS_PATH = "/fake/src/Button.module.scss";
const THEME_PATH = "/fake/src/theme.module.scss";
const TOKENS_PATH = "/fake/src/tokens.module.scss";

describe("resolveStyleCompletionItems", () => {
  it("returns same-file Sass variable completions after `$`", () => {
    const scss = `$gap: 1rem;
@mixin raised($depth) {
  box-shadow: 0 0 $depth black;
}
.button {
  color: $
}
`;
    const result = resolveStyleCompletionItems({
      content: scss,
      line: 5,
      character: 10,
      styleDocument: parseStyleDocument(scss, SCSS_PATH),
    });

    expect(result.map((item) => item.label)).toEqual(["$gap"]);
    expect(result[0]).toMatchObject({
      insertText: "$gap",
      replacementRange: {
        start: { line: 5, character: 9 },
        end: { line: 5, character: 10 },
      },
    });
  });

  it("returns same-file Sass mixin completions after `@include`", () => {
    const scss = `@mixin raised() {}
.button {
  @include ra
}
`;
    const result = resolveStyleCompletionItems({
      content: scss,
      line: 2,
      character: 13,
      styleDocument: parseStyleDocument(scss, SCSS_PATH),
    });

    expect(result.map((item) => item.label)).toEqual(["raised"]);
    expect(result[0]).toMatchObject({
      insertText: "raised",
      replacementRange: {
        start: { line: 2, character: 11 },
        end: { line: 2, character: 13 },
      },
    });
  });

  it("returns same-file Sass function completions in declaration values", () => {
    const scss = `@function tone($value) { @return $value; }
.button {
  color: to
}
`;
    const result = resolveStyleCompletionItems({
      content: scss,
      line: 2,
      character: 11,
      styleDocument: parseStyleDocument(scss, SCSS_PATH),
    });

    expect(result.map((item) => item.label)).toEqual(["tone"]);
    expect(result[0]).toMatchObject({
      insertText: "tone",
      replacementRange: {
        start: { line: 2, character: 9 },
        end: { line: 2, character: 11 },
      },
    });
  });

  it("returns wildcard Sass module completions from @use targets", () => {
    const scss = `@use "./tokens.module" as *;

.button {
  color: $;
  @include ra;
  border-color: to;
}
`;
    const tokensScss = `$gap: 1rem;
@mixin raised() {}
@function tone($value) { @return $value; }
`;
    const styleDocument = parseStyleDocument(scss, SCSS_PATH);
    const targetDocument = parseStyleDocument(tokensScss, TOKENS_PATH);
    const styleDocumentForPath = styleDocumentMap([styleDocument, targetDocument]);

    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 3,
        character: 10,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["$gap"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 4,
        character: 13,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["raised"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 5,
        character: 18,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["tone"]);
  });

  it("returns completions forwarded through wildcard @use targets", () => {
    const scss = `@use "./theme.module" as *;

.button {
  color: $;
  @include ra;
  border-color: to;
}
`;
    const themeScss = `@forward "./tokens.module";`;
    const tokensScss = `$gap: 1rem;
@mixin raised() {}
@function tone($value) { @return $value; }
`;
    const styleDocument = parseStyleDocument(scss, SCSS_PATH);
    const themeDocument = parseStyleDocument(themeScss, THEME_PATH);
    const targetDocument = parseStyleDocument(tokensScss, TOKENS_PATH);
    const styleDocumentForPath = styleDocumentMap([styleDocument, themeDocument, targetDocument]);

    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 3,
        character: 10,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["$gap"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 4,
        character: 13,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["raised"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 5,
        character: 18,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["tone"]);
  });

  it("returns prefixed completions filtered by forwarded wildcard @use targets", () => {
    const scss = `@use "./theme.module" as *;

.button {
  color: $theme;
  @include theme-ra;
  border-color: theme-to;
}
`;
    const themeScss = `@forward "./tokens.module" as theme-* show $gap, raised, tone;`;
    const tokensScss = `$gap: 1rem;
$secret: 2rem;
@mixin raised() {}
@function tone($value) { @return $value; }
@function hidden($value) { @return $value; }
`;
    const styleDocument = parseStyleDocument(scss, SCSS_PATH);
    const themeDocument = parseStyleDocument(themeScss, THEME_PATH);
    const targetDocument = parseStyleDocument(tokensScss, TOKENS_PATH);
    const styleDocumentForPath = styleDocumentMap([styleDocument, themeDocument, targetDocument]);

    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 3,
        character: 15,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["$theme-gap"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 4,
        character: 19,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["theme-raised"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 5,
        character: 24,
        styleDocument,
        styleDocumentForPath,
      }).map((item) => item.label),
    ).toEqual(["theme-tone"]);
  });

  it("keeps Sass parameter variables local to their callable body", () => {
    const scss = `$gap: 1rem;
@mixin raised($depth) {
  box-shadow: $
}
.button {
  color: $
}
`;
    const styleDocument = parseStyleDocument(scss, SCSS_PATH);
    const insideMixin = resolveStyleCompletionItems({
      content: scss,
      line: 2,
      character: 16,
      styleDocument,
    });
    const outsideMixin = resolveStyleCompletionItems({
      content: scss,
      line: 5,
      character: 10,
      styleDocument,
    });

    expect(insideMixin.map((item) => item.label)).toEqual(["$depth", "$gap"]);
    expect(outsideMixin.map((item) => item.label)).toEqual(["$gap"]);
  });

  it("falls back to raw Sass declarations when the style document is mid-edit invalid", () => {
    const scss = `$gap: 1rem;
@mixin raised() {}
@function tone($value) { @return $value; }
.button {
  color: $
  @include ra
  border-color: to
}
`;
    const styleDocument = parseStyleDocument(scss, SCSS_PATH);

    expect(styleDocument.sassSymbolDecls).toEqual([]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 4,
        character: 10,
        styleDocument,
      }).map((item) => item.label),
    ).toEqual(["$gap"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 5,
        character: 13,
        styleDocument,
      }).map((item) => item.label),
    ).toEqual(["raised"]);
    expect(
      resolveStyleCompletionItems({
        content: scss,
        line: 6,
        character: 18,
        styleDocument,
      }).map((item) => item.label),
    ).toEqual(["tone"]);
  });
});

function styleDocumentMap(documents: readonly ReturnType<typeof parseStyleDocument>[]) {
  const byPath = new Map(documents.map((document) => [document.filePath, document]));
  return (filePath: string) => byPath.get(filePath) ?? null;
}
