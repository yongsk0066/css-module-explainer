import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildSourceBinder } from "../../../server/src/core/binder/binder-builder";
import { buildSourceBindingGraph } from "../../../server/src/core/binder/source-binding-graph";
import type { AnalysisEntry } from "../../../server/src/core/indexing/document-analysis-cache";
import {
  makeSourceDocumentHIR,
  makeStyleImportBinding,
  makeSymbolRefClassExpression,
} from "../../../server/src/core/hir/source-types";
import { WorkspaceSemanticWorkspaceReferenceIndex } from "../../../server/src/core/semantic/workspace-reference-index";
import { collectSemanticReferenceContribution } from "../../../server/src/core/semantic/reference-collector";
import type { StyleImport } from "@css-module-explainer/shared";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
import { info } from "../../_fixtures/test-helpers";
import { buildStyleDocumentFromSelectorMap } from "../../_fixtures/style-documents";

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
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([["indicator", info("indicator")]]),
    );

    const contribution = collectSemanticReferenceContribution(URI, entry, {
      styleDocumentForPath: (path) => (path === SCSS_PATH ? styleDocument : null),
      typeResolver: new FakeTypeResolver(),
      filePath: FILE_PATH,
      workspaceRoot: "/fake/ws",
      settingsKey: "transform:asIs;alias:",
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
    const styleDocument = buildStyleDocumentFromSelectorMap(
      SCSS_PATH,
      new Map([["indicator", info("indicator")]]),
    );

    const contribution = collectSemanticReferenceContribution(URI, entry, {
      styleDocumentForPath: (path) => (path === SCSS_PATH ? styleDocument : null),
      typeResolver: new FakeTypeResolver(),
      filePath: FILE_PATH,
      workspaceRoot: "/fake/ws",
      settingsKey: "transform:asIs;alias:",
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

  it("indexes contribution dependencies by workspaceRoot and settingsKey", () => {
    const index = new WorkspaceSemanticWorkspaceReferenceIndex();
    index.record(
      "file:///fake/ws/src/App.tsx",
      [],
      [
        {
          refId: "ref:1",
          uri: "file:///fake/ws/src/App.tsx",
          filePath: "/fake/ws/src/App.tsx",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          origin: "cxCall",
          scssModulePath: SCSS_PATH,
          expressionKind: "symbolRef",
          hasResolvedTargets: false,
          isDynamic: true,
        },
      ],
      {
        workspaceRoot: "/fake/ws",
        settingsKey: "transform:asIs;alias:",
        stylePaths: [SCSS_PATH],
        sourcePaths: [FILE_PATH, "/fake/ws/src/theme.ts"],
      },
    );

    expect(index.findUrisBySettingsDependency("/fake/ws", "transform:asIs;alias:")).toEqual([
      "file:///fake/ws/src/App.tsx",
    ]);
    expect(index.findUrisBySourceDependency("/fake/ws", "/fake/ws/src/theme.ts")).toEqual([
      "file:///fake/ws/src/App.tsx",
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
      makeStyleImportBinding("style:styles", "styles", "decl:0", {
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
    sourceBinder: buildSourceBinder(sourceFile),
    sourceBindingGraph: buildSourceBindingGraph(sourceDocument, buildSourceBinder(sourceFile)),
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
    sourceDependencyPaths: [FILE_PATH, "/fake/ws/src/theme.ts"],
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
