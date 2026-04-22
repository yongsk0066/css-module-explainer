import { describe, expect, it } from "vitest";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { resolveStyleReferencesAtCursor } from "../../../server/engine-host-node/src/style-references-query";
import { makeBaseDeps } from "../../_fixtures/test-helpers";

describe("resolveStyleReferencesAtCursor", () => {
  it("returns declaration plus same-file animation references", () => {
    const filePath = "/fake/src/Button.module.scss";
    const content = `@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.box {
  animation: fade 1s linear;
}

.pulse {
  animation-name: fade;
}
`;
    const styleDocument = parseStyleDocument(content, filePath);
    const deps = makeBaseDeps({
      styleDocumentForPath: (path) => (path === filePath ? styleDocument : null),
    });

    const result = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: 0,
        character: 13,
        includeDeclaration: true,
        styleDocument,
      },
      deps,
    );

    expect(result).toHaveLength(3);
    expect(result.every((location) => location.uri === "file:///fake/src/Button.module.scss")).toBe(
      true,
    );
    expect(result.some((location) => location.range.start.line === 0)).toBe(true);
    expect(result.some((location) => location.range.start.line === 6)).toBe(true);
    expect(result.some((location) => location.range.start.line === 10)).toBe(true);
  });

  it("returns imported value declaration and local sites", () => {
    const filePath = "/fake/src/Button.module.scss";
    const tokensPath = "/fake/src/tokens.module.scss";
    const content = `@value primary from "./tokens.module.scss";

.button {
  color: primary;
}
`;
    const tokens = `@value primary: #ff3355;`;
    const styleDocument = parseStyleDocument(content, filePath);
    const tokensDocument = parseStyleDocument(tokens, tokensPath);
    const deps = makeBaseDeps({
      styleDocumentForPath: (path) => {
        if (path === filePath) return styleDocument;
        if (path === tokensPath) return tokensDocument;
        return null;
      },
    });

    const result = resolveStyleReferencesAtCursor(
      {
        filePath,
        line: 0,
        character: 9,
        includeDeclaration: true,
        styleDocument,
      },
      deps,
    );

    expect(result).toHaveLength(3);
    expect(result[0]?.uri).toBe("file:///fake/src/tokens.module.scss");
    expect(result.some((location) => location.uri === "file:///fake/src/Button.module.scss")).toBe(
      true,
    );
  });
});
