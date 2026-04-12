import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { ClassRef } from "@css-module-explainer/shared";
import { buildSourceDocumentFromLegacy } from "../../../server/src/core/hir/builders/ts-source-adapter";
import {
  collectSemanticReferenceSites,
  WorkspaceSemanticWorkspaceReferenceIndex,
} from "../../../server/src/core/semantic/workspace-reference-index";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { loadSourceScenario, loadStyleScenario } from "../../_fixtures/scenario-corpus";

describe("collectSemanticReferenceSites", () => {
  it("collects exact and inferred sites from a source analysis entry", () => {
    const sourceScenario = loadSourceScenario({
      id: "01-basic",
      sourcePath: "01-basic/BasicScenario.tsx",
    });
    const styleScenario = loadStyleScenario({
      id: "01-basic-style",
      stylePath: "01-basic/Button.module.scss",
    });

    const typeResolver = new FakeTypeResolver(["sm", "md", "lg"]);

    const sites = collectSemanticReferenceSites(
      pathToFileURL(sourceScenario.filePath).href,
      {
        version: 1,
        contentHash: "fixture",
        sourceFile: ts.createSourceFile(
          sourceScenario.filePath,
          readFileSync(sourceScenario.filePath, "utf8"),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        ),
        bindings: [],
        classRefs: sourceScenario.compatClassRefs,
        sourceDocument: sourceScenario.sourceDocument,
        stylesBindings: new Map(),
        classUtilNames: [],
      },
      {
        styleDocumentForPath: (path) =>
          path === styleScenario.filePath ? styleScenario.styleDocument : null,
        typeResolver,
        workspaceRoot: "/fake/ws",
        filePath: sourceScenario.filePath,
      },
    );

    expect(sites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "button",
          certainty: "exact",
          reason: "literal",
        }),
        expect.objectContaining({
          canonicalName: "sm",
          certainty: "inferred",
          reason: "typeUnion",
        }),
      ]),
    );
  });

  it("collects branch-derived symbol references without type information", () => {
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

    const sites = collectSemanticReferenceSites(
      "file:///fake/Flow.tsx",
      {
        version: 1,
        contentHash: "fixture",
        sourceFile,
        bindings: [],
        classRefs: [ref],
        sourceDocument,
        stylesBindings: new Map(),
        classUtilNames: [],
      },
      {
        styleDocumentForPath: (path) =>
          path === styleScenario.filePath ? styleScenario.styleDocument : null,
        typeResolver: new FakeTypeResolver(),
        workspaceRoot: "/fake/ws",
        filePath: "/fake/Flow.tsx",
      },
    );

    expect(sites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "sm",
          certainty: "inferred",
          reason: "flowBranch",
        }),
        expect.objectContaining({
          canonicalName: "lg",
          certainty: "inferred",
          reason: "flowBranch",
        }),
      ]),
    );
  });
});

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

describe("WorkspaceSemanticWorkspaceReferenceIndex", () => {
  it("records, counts, and forgets selector contributions by uri", () => {
    const index = new WorkspaceSemanticWorkspaceReferenceIndex();
    index.record("file:///a.tsx", [
      {
        refId: "class-expr:0",
        selectorId: "selector:/fake/Button.module.scss:button",
        filePath: "/fake/App.tsx",
        uri: "file:///a.tsx",
        range: { start: { line: 4, character: 6 }, end: { line: 4, character: 12 } },
        origin: "cxCall",
        scssModulePath: "/fake/Button.module.scss",
        selectorFilePath: "/fake/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        reason: "literal",
        expansion: "direct",
      },
    ]);
    index.record("file:///b.tsx", [
      {
        refId: "class-expr:3",
        selectorId: "selector:/fake/Button.module.scss:button",
        filePath: "/fake/Other.tsx",
        uri: "file:///b.tsx",
        range: { start: { line: 7, character: 3 }, end: { line: 7, character: 9 } },
        origin: "cxCall",
        scssModulePath: "/fake/Button.module.scss",
        selectorFilePath: "/fake/Button.module.scss",
        canonicalName: "button",
        className: "button",
        certainty: "exact",
        reason: "literal",
        expansion: "direct",
      },
    ]);

    expect(index.countSelectorReferences("/fake/Button.module.scss", "button")).toBe(2);
    expect(index.findAllForScssPath("/fake/Button.module.scss")).toHaveLength(2);

    index.forget("file:///a.tsx");
    expect(index.countSelectorReferences("/fake/Button.module.scss", "button")).toBe(1);
    expect(index.findSelectorReferences("/fake/Button.module.scss", "button")).toEqual([
      expect.objectContaining({
        uri: "file:///b.tsx",
      }),
    ]);
  });
});
