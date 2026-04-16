import { describe, expect, it } from "vitest";
import ts from "typescript";
import { buildSourceBinder } from "../../../server/engine-core-ts/src/core/binder/binder-builder";
import { readSourceExpressionResolution } from "../../../server/engine-core-ts/src/core/query/read-source-expression-resolution";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { buildSourceDocumentFixture } from "../../_fixtures/source-documents";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";
import { info } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";

describe("readSourceExpressionResolution", () => {
  it("projects flow-derived symbol values into selectors and finite values", () => {
    const source = `
function render(flag: boolean) {
  let size = "sm";
  if (flag) size = "lg";
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/ws/src/Button.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const expression = {
      kind: "symbolRef",
      id: "expr:symbol",
      origin: "cxCall",
      rawReference: "size",
      rootName: "size",
      rootBindingDeclId: "decl:size",
      pathSegments: [],
      range: rangeForLastToken(sourceFile, "size"),
      scssModulePath: SCSS_PATH,
    } as const;

    const resolution = readSourceExpressionResolution(
      {
        expression,
        sourceFile,
        styleDocument: buildStyleDocumentFromSelectorMap(
          SCSS_PATH,
          new Map([
            ["sm", info("sm")],
            ["lg", info("lg")],
          ]),
        ),
      },
      {
        typeResolver: new FakeTypeResolver(),
        filePath: "/fake/ws/src/Button.tsx",
        workspaceRoot: "/fake/ws",
        sourceBinder: buildSourceBinder(sourceFile),
      },
    );

    expect(resolution.selectors.map((selector) => selector.name).toSorted()).toEqual(["lg", "sm"]);
    expect(resolution.finiteValues?.toSorted()).toEqual(["lg", "sm"]);
    expect(resolution.valueCertainty).toBe("inferred");
    expect(resolution.selectorCertainty).toBe("exact");
    expect(resolution.reason).toBe("flowBranch");
  });

  it("returns an empty result when no style document can be resolved", () => {
    const sourceFile = ts.createSourceFile(
      "/fake/ws/src/Button.tsx",
      `cx("button");`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const sourceDocument = buildSourceDocumentFixture({
      filePath: "/fake/ws/src/Button.tsx",
      bindings: [],
      stylesBindings: new Map(),
      classUtilNames: [],
      expressions: [
        {
          kind: "literal",
          id: "expr:literal",
          origin: "cxCall",
          className: "button",
          range: rangeForToken(sourceFile, "button"),
          scssModulePath: SCSS_PATH,
        },
      ],
    });

    const resolution = readSourceExpressionResolution(
      {
        expression: sourceDocument.classExpressions[0]!,
        sourceFile,
      },
      {
        styleDocumentForPath: () => null,
        typeResolver: new FakeTypeResolver(),
        filePath: "/fake/ws/src/Button.tsx",
        workspaceRoot: "/fake/ws",
        sourceBinder: buildSourceBinder(sourceFile),
      },
    );

    expect(resolution.styleDocument).toBeNull();
    expect(resolution.selectors).toEqual([]);
    expect(resolution.finiteValues).toBeNull();
    expect(resolution.selectorCertainty).toBe("possible");
  });
});

function rangeForToken(sourceFile: ts.SourceFile, token: string) {
  const start = sourceFile.text.indexOf(token);
  if (start === -1) throw new Error(`Token not found: ${token}`);
  return toRange(sourceFile, start, start + token.length);
}

function rangeForLastToken(sourceFile: ts.SourceFile, token: string) {
  const start = sourceFile.text.lastIndexOf(token);
  if (start === -1) throw new Error(`Token not found: ${token}`);
  return toRange(sourceFile, start, start + token.length);
}

function toRange(sourceFile: ts.SourceFile, start: number, end: number) {
  const startLc = sourceFile.getLineAndCharacterOfPosition(start);
  const endLc = sourceFile.getLineAndCharacterOfPosition(end);
  return {
    start: { line: startLc.line, character: startLc.character },
    end: { line: endLc.line, character: endLc.character },
  };
}
