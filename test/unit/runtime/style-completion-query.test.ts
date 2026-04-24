import { describe, expect, it } from "vitest";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { resolveStyleCompletionItems } from "../../../server/engine-host-node/src/style-completion-query";

const SCSS_PATH = "/fake/src/Button.module.scss";

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
});
