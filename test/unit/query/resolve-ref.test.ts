import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import type { ClassRef, StyleImport } from "@css-module-explainer/shared";
import type { AnalysisEntry } from "../../../server/src/core/indexing/document-analysis-cache";
import { buildSourceDocumentFromLegacy } from "../../../server/src/core/hir/builders/ts-source-adapter";
import { resolveRefSelectorInfos } from "../../../server/src/core/query/resolve-ref";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { loadSourceScenario, loadStyleScenario } from "../../_fixtures/scenario-corpus";

describe("resolveRefSelectorInfos", () => {
  it("resolves selector infos through the semantic query for symbol refs", () => {
    const sourceScenario = loadSourceScenario({
      id: "01-basic",
      sourcePath: "01-basic/BasicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });
    const variableRef = sourceScenario.compatClassRefs.find(
      (ref) => ref.kind === "variable" && ref.variableName === "size",
    );
    expect(variableRef).toBeDefined();

    const infos = resolveRefSelectorInfos(
      {
        ref: variableRef!,
        classMap: styleScenario.compatClassMap,
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

    expect(infos.map((info) => info.name).toSorted()).toEqual(["lg", "md", "sm"]);
  });

  it("falls back to the legacy resolver when the HIR match is missing", () => {
    const sourceScenario = loadSourceScenario({
      id: "01-basic",
      sourcePath: "01-basic/BasicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });
    const staticRef = sourceScenario.compatClassRefs.find(
      (ref) => ref.kind === "static" && ref.className === "button",
    );
    expect(staticRef).toBeDefined();

    const infos = resolveRefSelectorInfos(
      {
        ref: {
          ...staticRef!,
          originRange: {
            start: { line: 999, character: 0 },
            end: { line: 999, character: 6 },
          },
        },
        classMap: styleScenario.compatClassMap,
        entry: analysisEntryFor(sourceScenario),
      },
      {
        styleDocumentForPath: () => null,
        typeResolver: new FakeTypeResolver(),
        filePath: sourceScenario.filePath,
        workspaceRoot: "/fake/ws",
      },
    );

    expect(infos.map((info) => info.name)).toEqual(["button"]);
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
    const ref = variableRefAt(source, "size", styleScenario.filePath);
    const sourceDocument = buildSourceDocumentFromLegacy({
      filePath: "/fake/Flow.tsx",
      bindings: [],
      stylesBindings: new Map(),
      classUtilNames: [],
      classRefs: [ref],
    });

    const infos = resolveRefSelectorInfos(
      {
        ref,
        classMap: styleScenario.compatClassMap,
        entry: {
          version: 1,
          contentHash: "fixture",
          sourceFile,
          bindings: [],
          classRefs: [ref],
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

    expect(infos.map((info) => info.name).toSorted()).toEqual(["lg", "sm"]);
  });
});

function analysisEntryFor(sourceScenario: ReturnType<typeof loadSourceScenario>): AnalysisEntry {
  const content = readFileSync(sourceScenario.filePath, "utf8");
  return {
    version: 1,
    contentHash: "fixture",
    sourceFile: ts.createSourceFile(
      sourceScenario.filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    bindings: [],
    classRefs: sourceScenario.compatClassRefs,
    sourceDocument: sourceScenario.sourceDocument,
    stylesBindings: toStyleBindingsMap(sourceScenario.sourceDocument.styleImports),
    classUtilNames: [],
  };
}

function variableRefAt(source: string, variableName: string, scssModulePath: string): ClassRef {
  const tokenIndex = source.lastIndexOf(`cx(${variableName})`) + 3;
  const prefix = source.slice(0, tokenIndex);
  const line = prefix.split("\n").length - 1;
  const lastLineStart = prefix.lastIndexOf("\n");
  const character = tokenIndex - (lastLineStart + 1);
  return {
    kind: "variable",
    origin: "cxCall",
    variableName,
    scssModulePath,
    originRange: {
      start: { line, character },
      end: { line, character: character + variableName.length },
    },
  };
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
