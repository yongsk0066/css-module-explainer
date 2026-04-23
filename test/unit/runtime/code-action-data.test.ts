import { describe, expect, it } from "vitest";
import {
  buildCreateKeyframesActionData,
  buildCreateSelectorActionData,
  buildCreateValueActionData,
} from "../../../server/engine-host-node/src/code-action-data";
import type {
  KeyframesDeclHIR,
  ValueDeclHIR,
} from "../../../server/engine-core-ts/src/core/hir/style-types";
import { makeStyleDocumentFixture, makeTestSelector } from "../../_fixtures/style-documents";

const scssPath = "/fake/ws/src/Button.module.scss";

describe("code-action recovery data", () => {
  it("builds selector creation edits at the end of existing selector rules", () => {
    const styleDocument = makeStyleDocumentFixture(scssPath, [
      makeTestSelector("base", 1, {
        ruleRange: {
          start: { line: 1, character: 0 },
          end: { line: 3, character: 1 },
        },
      }),
      makeTestSelector("active", 5, {
        ruleRange: {
          start: { line: 5, character: 0 },
          end: { line: 7, character: 1 },
        },
      }),
    ]);

    expect(buildCreateSelectorActionData("missing", scssPath, styleDocument)).toEqual({
      uri: "file:///fake/ws/src/Button.module.scss",
      range: {
        start: { line: 7, character: 1 },
        end: { line: 7, character: 1 },
      },
      newText: "\n\n.missing {\n}\n",
    });
  });

  it("builds value creation edits after existing value declarations", () => {
    const styleDocument = makeStyleDocumentFixture(
      scssPath,
      [],
      [],
      [],
      [valueDecl("primary", 0, 0, 20), valueDecl("secondary", 2, 0, 22)],
    );

    expect(buildCreateValueActionData("accent", scssPath, styleDocument)).toEqual({
      uri: "file:///fake/ws/src/Button.module.scss",
      range: {
        start: { line: 2, character: 22 },
        end: { line: 2, character: 22 },
      },
      newText: "\n@value accent: ;",
    });
  });

  it("builds keyframes creation edits ahead of selectors when no keyframes exist", () => {
    const styleDocument = makeStyleDocumentFixture(scssPath, [
      makeTestSelector("button", 2, {
        ruleRange: {
          start: { line: 2, character: 0 },
          end: { line: 4, character: 1 },
        },
      }),
    ]);

    expect(buildCreateKeyframesActionData("spin", scssPath, styleDocument)).toEqual({
      uri: "file:///fake/ws/src/Button.module.scss",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      newText: "@keyframes spin {\n}\n\n",
    });
  });

  it("builds keyframes creation edits after existing keyframes", () => {
    const styleDocument = makeStyleDocumentFixture(scssPath, [], [keyframesDecl("fade", 1, 0, 1)]);

    expect(buildCreateKeyframesActionData("spin", scssPath, styleDocument)).toEqual({
      uri: "file:///fake/ws/src/Button.module.scss",
      range: {
        start: { line: 3, character: 1 },
        end: { line: 3, character: 1 },
      },
      newText: "\n\n@keyframes spin {\n}\n",
    });
  });
});

function valueDecl(name: string, line: number, start: number, end: number): ValueDeclHIR {
  return {
    kind: "valueDecl",
    id: `value:${name}`,
    name,
    value: "red",
    range: {
      start: { line, character: start },
      end: { line, character: start + name.length },
    },
    ruleRange: {
      start: { line, character: start },
      end: { line, character: end },
    },
  };
}

function keyframesDecl(
  name: string,
  startLine: number,
  startCharacter: number,
  endCharacter: number,
): KeyframesDeclHIR {
  return {
    kind: "keyframes",
    id: `keyframes:${name}`,
    name,
    range: {
      start: { line: startLine, character: startCharacter },
      end: { line: startLine, character: startCharacter + name.length },
    },
    ruleRange: {
      start: { line: startLine, character: startCharacter },
      end: { line: startLine + 2, character: endCharacter },
    },
  };
}
