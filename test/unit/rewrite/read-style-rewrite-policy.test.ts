import { describe, expect, it } from "vitest";
import { readStyleSelectorRewritePolicy } from "../../../server/engine-core-ts/src/core/rewrite/read-style-rewrite-policy";
import { makeStyleDocumentFixture, makeTestSelector } from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/src/Button.module.scss";

describe("readStyleSelectorRewritePolicy", () => {
  it("returns direct rewrite shape for flat selectors", () => {
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [makeTestSelector("button", 1)]);
    const result = readStyleSelectorRewritePolicy({
      styleDocument,
      selector: styleDocument.selectors[0]!,
      aliasMode: "asIs",
      rejectAliasSelectorViews: true,
    });

    expect(result).toEqual({
      kind: "policy",
      summary: expect.objectContaining({
        canonicalName: "button",
        rewriteShape: "direct",
        bemSuffix: null,
      }),
    });
  });

  it("returns bemSuffix rewrite shape for safe BEM nested selectors", () => {
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [
      makeTestSelector("button--primary", 1, {
        nestedSafety: "bemSuffixSafe",
        bemSuffix: {
          rawToken: "&--primary",
          rawTokenRange: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 12 },
          },
          parentResolvedName: "button",
        },
      }),
    ]);
    const result = readStyleSelectorRewritePolicy({
      styleDocument,
      selector: styleDocument.selectors[0]!,
      aliasMode: "asIs",
      rejectAliasSelectorViews: true,
    });

    expect(result).toEqual({
      kind: "policy",
      summary: expect.objectContaining({
        canonicalName: "button--primary",
        rewriteShape: "bemSuffix",
        bemSuffix: expect.objectContaining({
          rawToken: "&--primary",
        }),
      }),
    });
  });

  it("blocks alias selector views under alias-only modes", () => {
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [
      makeTestSelector("btn-primary", 1),
      makeTestSelector("btnPrimary", 1, {
        canonicalName: "btn-primary",
        viewKind: "alias",
      }),
    ]);
    const aliasSelector = styleDocument.selectors[1]!;

    const result = readStyleSelectorRewritePolicy({
      styleDocument,
      selector: aliasSelector,
      aliasMode: "camelCaseOnly",
      rejectAliasSelectorViews: true,
    });

    expect(result).toEqual({
      kind: "blocked",
      reason: "aliasViewBlocked",
    });
  });

  it("blocks interpolated BEM suffix selectors", () => {
    const styleDocument = makeStyleDocumentFixture(SCSS_PATH, [
      makeTestSelector("button--#{size}", 1, {
        nestedSafety: "bemSuffixSafe",
        bemSuffix: {
          rawToken: "&--#{size}",
          rawTokenRange: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 12 },
          },
          parentResolvedName: "button",
        },
      }),
    ]);

    const result = readStyleSelectorRewritePolicy({
      styleDocument,
      selector: styleDocument.selectors[0]!,
      aliasMode: "asIs",
      rejectAliasSelectorViews: true,
    });

    expect(result).toEqual({
      kind: "blocked",
      reason: "interpolatedSelector",
    });
  });
});
