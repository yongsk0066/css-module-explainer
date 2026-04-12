import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { AnalysisEntry } from "../../../server/src/core/indexing/document-analysis-cache";
import { buildStyleDocumentFromClassMap } from "../../../server/src/core/hir/builders/style-adapter";
import {
  makeSourceDocumentHIR,
  makeStyleImportBinding,
  makeSymbolRefClassExpression,
} from "../../../server/src/core/hir/source-types";
import {
  collectSemanticReferenceContribution,
  WorkspaceSemanticWorkspaceReferenceIndex,
} from "../../../server/src/core/semantic/workspace-reference-index";
import type { StyleImport } from "@css-module-explainer/shared";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { info } from "../../_fixtures/test-helpers";

const FILE_PATH = "/fake/ws/src/App.tsx";
const SCSS_PATH = "/fake/ws/src/Button.module.scss";
const URI = "file:///fake/ws/src/App.tsx";

describe("WorkspaceSemanticWorkspaceReferenceIndex", () => {
  it("tracks referencing uris for unresolved dynamic module usage", () => {
    const entry = makeEntry({
      sourceText: "cx(size);",
      rawReference: "size",
      rootName: "size",
      token: "size",
    });
    const styleDocument = buildStyleDocumentFromClassMap(
      SCSS_PATH,
      new Map([["indicator", info("indicator")]]),
    );

    const contribution = collectSemanticReferenceContribution(URI, entry, {
      styleDocumentForPath: (path) => (path === SCSS_PATH ? styleDocument : null),
      typeResolver: new FakeTypeResolver(),
      filePath: FILE_PATH,
      workspaceRoot: "/fake/ws",
    });

    expect(contribution.referenceSites).toEqual([]);
    expect(contribution.moduleUsages).toMatchObject([
      {
        scssModulePath: SCSS_PATH,
        isDynamic: true,
        hasResolvedTargets: false,
      },
    ]);

    const index = new WorkspaceSemanticWorkspaceReferenceIndex();
    index.record(URI, contribution.referenceSites, contribution.moduleUsages);
    expect(index.findReferencingUris(SCSS_PATH)).toEqual([URI]);
  });

  it("marks flow-resolved dynamic usage as resolved", () => {
    const entry = makeEntry({
      sourceText: ["const size = 'indicator';", "cx(size);"].join("\n"),
      rawReference: "size",
      rootName: "size",
      token: "size",
      tokenOccurrence: "last",
    });
    const styleDocument = buildStyleDocumentFromClassMap(
      SCSS_PATH,
      new Map([["indicator", info("indicator")]]),
    );

    const contribution = collectSemanticReferenceContribution(URI, entry, {
      styleDocumentForPath: (path) => (path === SCSS_PATH ? styleDocument : null),
      typeResolver: new FakeTypeResolver(),
      filePath: FILE_PATH,
      workspaceRoot: "/fake/ws",
    });

    expect(contribution.referenceSites).toHaveLength(1);
    expect(contribution.moduleUsages).toMatchObject([
      {
        scssModulePath: SCSS_PATH,
        isDynamic: true,
        hasResolvedTargets: true,
      },
    ]);
  });
});

function makeEntry(args: {
  sourceText: string;
  rawReference: string;
  rootName: string;
  token: string;
  tokenOccurrence?: "first" | "last";
}): AnalysisEntry {
  const sourceFile = ts.createSourceFile(
    FILE_PATH,
    args.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const sourceDocument = makeSourceDocumentHIR({
    filePath: FILE_PATH,
    language: "tsx",
    styleImports: [
      makeStyleImportBinding("style:styles", "styles", {
        kind: "resolved",
        absolutePath: SCSS_PATH,
      } satisfies StyleImport),
    ],
    utilityBindings: [],
    classExpressions: [
      makeSymbolRefClassExpression(
        "ref:size",
        "cxCall",
        SCSS_PATH,
        args.rawReference,
        args.rootName,
        [],
        rangeForToken(sourceFile, args.token, args.tokenOccurrence ?? "first"),
      ),
    ],
  });

  return {
    version: 1,
    contentHash: "fixture",
    sourceFile,
    bindings: [],
    classRefs: [],
    sourceDocument,
    stylesBindings: new Map([
      [
        "styles",
        {
          kind: "resolved",
          absolutePath: SCSS_PATH,
        } satisfies StyleImport,
      ],
    ]),
    classUtilNames: [],
  };
}

function rangeForToken(sourceFile: ts.SourceFile, token: string, occurrence: "first" | "last") {
  const start =
    occurrence === "last" ? sourceFile.text.lastIndexOf(token) : sourceFile.text.indexOf(token);
  if (start === -1) throw new Error(`Token not found: ${token}`);
  const end = start + token.length;
  const startLc = sourceFile.getLineAndCharacterOfPosition(start);
  const endLc = sourceFile.getLineAndCharacterOfPosition(end);
  return {
    start: { line: startLc.line, character: startLc.character },
    end: { line: endLc.line, character: endLc.character },
  };
}
