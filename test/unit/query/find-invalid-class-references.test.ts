import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { ScssClassMap } from "@css-module-explainer/shared";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/builders/style-adapter";
import type { ClassExpressionHIR } from "../../../server/src/core/hir/source-types";
import { findInvalidClassReference } from "../../../server/src/core/query/find-invalid-class-references";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { info } from "../../_fixtures/test-helpers";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";

function styleDocument(classMap: ScssClassMap) {
  return buildStyleDocumentFromClassMap(SCSS_PATH, classMap);
}

describe("findInvalidClassReference", () => {
  it("reports a missing static class with a suggestion", () => {
    const sourceFile = ts.createSourceFile(
      "/fake/ws/src/Button.tsx",
      "cx('indicaror');",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const expression: ClassExpressionHIR = {
      kind: "literal",
      id: "expr:literal",
      origin: "cxCall",
      className: "indicaror",
      range: rangeForToken(sourceFile, "indicaror"),
      scssModulePath: SCSS_PATH,
    };

    expect(
      findInvalidClassReference(
        expression,
        sourceFile,
        styleDocument(new Map([["indicator", info("indicator")]]) as ScssClassMap),
        {
          typeResolver: new FakeTypeResolver(),
          filePath: "/fake/ws/src/Button.tsx",
          workspaceRoot: "/fake/ws",
        },
      ),
    ).toMatchObject({
      kind: "missingStaticClass",
      suggestion: "indicator",
    });
  });

  it("resolves local flow values before consulting the type resolver", () => {
    const sourceText = ["const size = enabled ? 'indicator' : 'missing';", "cx(size);"].join("\n");
    const sourceFile = ts.createSourceFile(
      "/fake/ws/src/Button.tsx",
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const expression: ClassExpressionHIR = {
      kind: "symbolRef",
      id: "expr:symbol",
      origin: "cxCall",
      rawReference: "size",
      rootName: "size",
      pathSegments: [],
      range: rangeForLastToken(sourceFile, "size"),
      scssModulePath: SCSS_PATH,
    };

    expect(
      findInvalidClassReference(
        expression,
        sourceFile,
        styleDocument(new Map([["indicator", info("indicator")]]) as ScssClassMap),
        {
          typeResolver: new FakeTypeResolver(),
          filePath: "/fake/ws/src/Button.tsx",
          workspaceRoot: "/fake/ws",
        },
      ),
    ).toMatchObject({
      kind: "missingResolvedClassValues",
      missingValues: ["missing"],
      reason: "flowBranch",
      certainty: "inferred",
    });
  });

  it("falls back to type-union values when flow cannot resolve the symbol", () => {
    const sourceFile = ts.createSourceFile(
      "/fake/ws/src/Button.tsx",
      "cx(size);",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const expression: ClassExpressionHIR = {
      kind: "symbolRef",
      id: "expr:symbol",
      origin: "cxCall",
      rawReference: "size",
      rootName: "size",
      pathSegments: [],
      range: rangeForToken(sourceFile, "size"),
      scssModulePath: SCSS_PATH,
    };

    expect(
      findInvalidClassReference(
        expression,
        sourceFile,
        styleDocument(new Map([["small", info("small")]]) as ScssClassMap),
        {
          typeResolver: new FakeTypeResolver(["small", "large"]),
          filePath: "/fake/ws/src/Button.tsx",
          workspaceRoot: "/fake/ws",
        },
      ),
    ).toMatchObject({
      kind: "missingResolvedClassValues",
      missingValues: ["large"],
      reason: "typeUnion",
      certainty: "inferred",
    });
  });
});

function rangeForToken(sourceFile: ts.SourceFile, token: string) {
  const start = sourceFile.text.indexOf(token);
  if (start === -1) throw new Error(`Token not found: ${token}`);
  const end = start + token.length;
  return toRange(sourceFile, start, end);
}

function rangeForLastToken(sourceFile: ts.SourceFile, token: string) {
  const start = sourceFile.text.lastIndexOf(token);
  if (start === -1) throw new Error(`Token not found: ${token}`);
  const end = start + token.length;
  return toRange(sourceFile, start, end);
}

function toRange(sourceFile: ts.SourceFile, start: number, end: number) {
  const startLc = sourceFile.getLineAndCharacterOfPosition(start);
  const endLc = sourceFile.getLineAndCharacterOfPosition(end);
  return {
    start: { line: startLc.line, character: startLc.character },
    end: { line: endLc.line, character: endLc.character },
  };
}
