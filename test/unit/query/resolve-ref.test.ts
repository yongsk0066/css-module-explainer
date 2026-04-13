import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import type { StyleImport } from "@css-module-explainer/shared";
import { buildSourceBinder } from "../../../server/src/core/binder/binder-builder";
import type { AnalysisEntry } from "../../../server/src/core/indexing/document-analysis-cache";
import { resolveRefSelectors } from "../../../server/src/core/query/resolve-ref";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { loadSourceScenario, loadStyleScenario } from "../../_fixtures/scenario-corpus";
import { buildSourceDocumentFixture } from "../../_fixtures/source-documents";

describe("resolveRefSelectors", () => {
  it("resolves selectors through the semantic query for symbol refs", () => {
    const sourceScenario = loadSourceScenario({
      id: "01-basic",
      sourcePath: "01-basic/BasicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });
    const variableExpression = sourceScenario.sourceDocument.classExpressions.find(
      (expression) => expression.kind === "symbolRef" && expression.rawReference === "size",
    );
    expect(variableExpression).toBeDefined();

    const selectors = resolveRefSelectors(
      {
        expression: variableExpression!,
        styleDocument: styleScenario.styleDocument,
        entry: analysisEntryFor(sourceScenario),
      },
      {
        styleDocumentForPath: (path) =>
          path === styleScenario.filePath ? styleScenario.styleDocument : null,
        typeResolver: new FakeTypeResolver(["sm", "md", "lg"]),
        filePath: sourceScenario.filePath,
        workspaceRoot: "/fake/ws",
      },
    );

    expect(selectors.map((selector) => selector.name).toSorted()).toEqual(["lg", "md", "sm"]);
  });

  it("falls back to style-document resolution when the graph has no match", () => {
    const sourceScenario = loadSourceScenario({
      id: "01-basic",
      sourcePath: "01-basic/BasicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });
    const staticExpression = sourceScenario.sourceDocument.classExpressions.find(
      (expression) => expression.kind === "literal" && expression.className === "button",
    );
    expect(staticExpression).toBeDefined();

    const selectors = resolveRefSelectors(
      {
        expression: {
          ...staticExpression!,
          range: {
            start: { line: 999, character: 0 },
            end: { line: 999, character: 6 },
          },
        },
        styleDocument: null,
        entry: analysisEntryFor(sourceScenario),
      },
      {
        styleDocumentForPath: (path) =>
          path === styleScenario.filePath ? styleScenario.styleDocument : null,
        typeResolver: new FakeTypeResolver(),
        filePath: sourceScenario.filePath,
        workspaceRoot: "/fake/ws",
      },
    );

    expect(selectors.map((selector) => selector.name)).toEqual(["button"]);
  });

  it("resolves symbol refs from local flow when the type resolver is unresolvable", () => {
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });
    const source = `
function render(flag: boolean) {
  let size = "sm";
  if (flag) {
    size = "lg";
  }
  return cx(size);
}
`;
    const sourceFile = ts.createSourceFile(
      "/fake/Flow.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const expression = variableExpressionAt(source, "size", styleScenario.filePath);
    const sourceDocument = buildSourceDocumentFixture({
      filePath: "/fake/Flow.tsx",
      bindings: [],
      stylesBindings: new Map(),
      classUtilNames: [],
      expressions: [variableExpressionSpecAt(source, "size", styleScenario.filePath)],
    });

    const selectors = resolveRefSelectors(
      {
        expression,
        styleDocument: styleScenario.styleDocument,
        entry: {
          version: 1,
          contentHash: "fixture",
          sourceFile,
          sourceBinder: buildSourceBinder(sourceFile),
          bindings: [],
          sourceDocument,
          stylesBindings: new Map(),
          classUtilNames: [],
        },
      },
      {
        styleDocumentForPath: (path) =>
          path === styleScenario.filePath ? styleScenario.styleDocument : null,
        typeResolver: new FakeTypeResolver(),
        filePath: "/fake/Flow.tsx",
        workspaceRoot: "/fake/ws",
      },
    );

    expect(selectors.map((selector) => selector.name).toSorted()).toEqual(["lg", "sm"]);
  });
});

function analysisEntryFor(sourceScenario: ReturnType<typeof loadSourceScenario>): AnalysisEntry {
  const content = readFileSync(sourceScenario.filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourceScenario.filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return {
    version: 1,
    contentHash: "fixture",
    sourceFile,
    sourceBinder: buildSourceBinder(sourceFile),
    bindings: [],
    sourceDocument: sourceScenario.sourceDocument,
    stylesBindings: toStyleBindingsMap(sourceScenario.sourceDocument.styleImports),
    classUtilNames: [],
  };
}

function variableExpressionSpecAt(source: string, variableName: string, scssModulePath: string) {
  const tokenIndex = source.lastIndexOf(`cx(${variableName})`) + 3;
  const prefix = source.slice(0, tokenIndex);
  const line = prefix.split("\n").length - 1;
  const lastLineStart = prefix.lastIndexOf("\n");
  const character = tokenIndex - (lastLineStart + 1);
  return {
    kind: "symbolRef" as const,
    origin: "cxCall",
    rawReference: variableName,
    scssModulePath,
    range: {
      start: { line, character },
      end: { line, character: character + variableName.length },
    },
  };
}

function variableExpressionAt(source: string, variableName: string, scssModulePath: string) {
  const expression = variableExpressionSpecAt(source, variableName, scssModulePath);
  return buildSourceDocumentFixture({
    filePath: "/fake/Flow.tsx",
    bindings: [],
    stylesBindings: new Map(),
    classUtilNames: [],
    expressions: [expression],
  }).classExpressions[0]!;
}

function toStyleBindingsMap(
  styleImports: readonly {
    readonly id: string;
    readonly localName: string;
    readonly resolved: StyleImport;
  }[],
): ReadonlyMap<string, StyleImport> {
  return new Map(styleImports.map((styleImport) => [styleImport.localName, styleImport.resolved]));
}
