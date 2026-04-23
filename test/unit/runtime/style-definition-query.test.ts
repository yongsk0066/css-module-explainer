import { describe, expect, it } from "vitest";
import type { StyleDocumentHIR } from "../../../server/engine-core-ts/src/core/hir/style-types";
import { parseStyleDocument } from "../../../server/engine-core-ts/src/core/scss/scss-parser";
import { resolveStyleDefinitionTargets } from "../../../server/engine-host-node/src/style-definition-query";

const BUTTON_PATH = "/fake/workspace/src/Button.module.scss";
const BASE_PATH = "/fake/workspace/src/Base.module.scss";
const TOKENS_PATH = "/fake/workspace/src/tokens.module.scss";

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
});

function depsForDocuments(documents: readonly StyleDocumentHIR[]) {
  const byPath = new Map(documents.map((document) => [document.filePath, document]));
  return {
    styleDocumentForPath: (filePath: string) => byPath.get(filePath) ?? null,
  };
}
