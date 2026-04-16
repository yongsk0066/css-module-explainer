import ts from "typescript";
import { describe, expect, it } from "vitest";
import { prefixClassValue } from "../../../server/engine-core-ts/src/core/abstract-value/class-value-domain";
import type { ClassExpressionHIR } from "../../../server/engine-core-ts/src/core/hir/source-types";
import { findInvalidClassReference } from "../../../server/engine-core-ts/src/core/query/find-invalid-class-references";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { info } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

const SCSS_PATH = "/fake/ws/src/Button.module.scss";

function styleDocument(selectors: ReadonlyMap<string, ReturnType<typeof info>>) {
  return buildStyleDocumentFromSelectorMap(SCSS_PATH, selectors);
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
        styleDocument(new Map([["indicator", info("indicator")]])),
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
        styleDocument(new Map([["indicator", info("indicator")]])),
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
      valueCertainty: "inferred",
      selectorCertainty: "inferred",
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
        styleDocument(new Map([["small", info("small")]])),
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
      valueCertainty: "inferred",
      selectorCertainty: "inferred",
    });
  });

  it("reports unresolved non-finite domains when no selector matches the resolved prefix", () => {
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
        styleDocument(new Map([["button", info("button")]])),
        {
          typeResolver: new FakeTypeResolver(),
          filePath: "/fake/ws/src/Button.tsx",
          workspaceRoot: "/fake/ws",
          resolveSymbolValues: () => ({
            abstractValue: prefixClassValue("ghost-"),
            values: [],
            valueCertainty: "inferred",
            reason: "flowBranch",
          }),
        },
      ),
    ).toMatchObject({
      kind: "missingResolvedClassDomain",
      abstractValue: { kind: "prefix", prefix: "ghost-" },
      reason: "flowBranch",
      valueCertainty: "inferred",
      selectorCertainty: "possible",
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
