import { describe, expect, it } from "vitest";
import type ts from "typescript";
import type { CxBinding } from "../../../server/engine-core-ts/src/core/cx/cx-types";
import { SourceFileCache } from "../../../server/engine-core-ts/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/engine-core-ts/src/core/indexing/document-analysis-cache";
import { buildSelectedQueryResultsV2 } from "../../../server/engine-host-node/src/engine-query-v2";
import {
  EMPTY_ALIAS_RESOLVER,
  buildTestClassExpressions,
  info,
  makeBaseDeps,
} from "../../_fixtures/test-helpers";

const SYMBOL_REF_TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const size = pick();
const el = cx(size);
`;

const detectCxBindings = (_sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/src/Button.module.scss",
    classNamesImportName: "classNames",
    bindingRange: {
      start: { line: 3, character: 6 },
      end: { line: 3, character: 8 },
    },
  },
];

function makeDeps() {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    scanCxImports: (sf, fp) => ({ stylesBindings: new Map(), bindings: detectCxBindings(sf, fp) }),
    parseClassExpressions: (_sf, bindings) =>
      buildTestClassExpressions({
        filePath: "/fake/src/Button.tsx",
        bindings,
        expressions:
          bindings.length === 0
            ? []
            : [
                {
                  kind: "symbolRef",
                  origin: "cxCall",
                  rawReference: "size",
                  rootName: "size",
                  pathSegments: [],
                  range: {
                    start: { line: 5, character: 15 },
                    end: { line: 5, character: 19 },
                  },
                  scssModulePath: bindings[0]!.scssModulePath,
                },
              ],
      }),
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    selectorMapForPath: () =>
      new Map([
        ["indicator", info("indicator")],
        ["active", info("active")],
      ]),
    workspaceRoot: "/fake",
  });
}

function buildResults(options: Parameters<typeof buildSelectedQueryResultsV2>[0]) {
  return buildSelectedQueryResultsV2(options);
}

describe("buildSelectedQueryResultsV2", () => {
  it("can source source-resolution query results from the rust backend", () => {
    const deps = makeDeps();
    const sourceDocuments = [
      {
        uri: "file:///fake/src/Button.tsx",
        content: SYMBOL_REF_TSX,
        filePath: "/fake/src/Button.tsx",
        version: 1,
      },
    ] as const;

    const results = buildResults({
      workspaceRoot: "/fake",
      classnameTransform: "asIs",
      pathAlias: {},
      sourceDocuments,
      styleFiles: ["/fake/src/Button.module.scss"],
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      semanticReferenceIndex: deps.semanticReferenceIndex,
      styleDependencyGraph: deps.styleDependencyGraph,
      env: {
        CME_SELECTED_QUERY_BACKEND: "rust-source-resolution",
      } as NodeJS.ProcessEnv,
      readRustSourceResolutionPayload: () => ({
        expressionId: "expr-1",
        styleFilePath: "/fake/src/Button.module.scss",
        selectorNames: ["indicator"],
        finiteValues: ["indicator", "active"],
        selectorCertainty: "inferred",
        valueCertainty: "inferred",
        selectorCertaintyShapeKind: "boundedFinite",
        selectorCertaintyShapeLabel: "bounded selector set (1)",
        valueCertaintyShapeKind: "boundedFinite",
        valueCertaintyShapeLabel: "bounded finite (2)",
      }),
    });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "source-expression-resolution",
          filePath: "/fake/src/Button.tsx",
          payload: expect.objectContaining({
            selectorNames: ["indicator"],
            finiteValues: ["indicator", "active"],
            selectorCertaintyShapeKind: "boundedFinite",
            valueCertaintyShapeKind: "boundedFinite",
          }),
        }),
      ]),
    );
  });

  it("can source expression-semantics query results from the rust backend", () => {
    const deps = makeDeps();
    const sourceDocuments = [
      {
        uri: "file:///fake/src/Button.tsx",
        content: SYMBOL_REF_TSX,
        filePath: "/fake/src/Button.tsx",
        version: 1,
      },
    ] as const;

    const results = buildResults({
      workspaceRoot: "/fake",
      classnameTransform: "asIs",
      pathAlias: {},
      sourceDocuments,
      styleFiles: ["/fake/src/Button.module.scss"],
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      semanticReferenceIndex: deps.semanticReferenceIndex,
      styleDependencyGraph: deps.styleDependencyGraph,
      env: {
        CME_SELECTED_QUERY_BACKEND: "rust-expression-semantics",
      } as NodeJS.ProcessEnv,
      readRustExpressionSemanticsPayload: () => ({
        expressionId: "expr-1",
        expressionKind: "symbolRef",
        styleFilePath: "/fake/src/Button.module.scss",
        selectorNames: ["indicator"],
        candidateNames: ["indicator", "active"],
        finiteValues: ["indicator", "active"],
        valueDomainKind: "finiteSet",
        selectorCertainty: "inferred",
        valueCertainty: "inferred",
        selectorCertaintyShapeKind: "boundedFinite",
        selectorCertaintyShapeLabel: "bounded selector set (1)",
        valueCertaintyShapeKind: "boundedFinite",
        valueCertaintyShapeLabel: "bounded finite (2)",
      }),
    });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "expression-semantics",
          filePath: "/fake/src/Button.tsx",
          payload: expect.objectContaining({
            selectorNames: ["indicator"],
            candidateNames: ["indicator", "active"],
            valueDomainKind: "finiteSet",
            selectorCertaintyShapeKind: "boundedFinite",
            valueCertaintyShapeKind: "boundedFinite",
          }),
        }),
      ]),
    );
  });

  it("can source selector-usage query results from the rust backend", () => {
    const deps = makeDeps();
    const sourceDocuments = [
      {
        uri: "file:///fake/src/Button.tsx",
        content: SYMBOL_REF_TSX,
        filePath: "/fake/src/Button.tsx",
        version: 1,
      },
    ] as const;

    const results = buildResults({
      workspaceRoot: "/fake",
      classnameTransform: "asIs",
      pathAlias: {},
      sourceDocuments,
      styleFiles: ["/fake/src/Button.module.scss"],
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
      typeResolver: deps.typeResolver,
      semanticReferenceIndex: deps.semanticReferenceIndex,
      styleDependencyGraph: deps.styleDependencyGraph,
      env: {
        CME_SELECTED_QUERY_BACKEND: "rust-selector-usage",
      } as NodeJS.ProcessEnv,
      readRustSelectorUsagePayload: (_options, filePath, canonicalName) => ({
        canonicalName,
        totalReferences: filePath.endsWith("Button.module.scss") ? 3 : 0,
        directReferenceCount: 2,
        editableDirectReferenceCount: 1,
        exactReferenceCount: 1,
        inferredOrBetterReferenceCount: 2,
        hasExpandedReferences: true,
        hasStyleDependencyReferences: true,
        hasAnyReferences: true,
      }),
    });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "selector-usage",
          filePath: "/fake/src/Button.module.scss",
          payload: expect.objectContaining({
            canonicalName: "indicator",
            totalReferences: 3,
            directReferenceCount: 2,
            editableDirectReferenceCount: 1,
            exactReferenceCount: 1,
            inferredOrBetterReferenceCount: 2,
            hasExpandedReferences: true,
            hasStyleDependencyReferences: true,
            hasAnyReferences: true,
          }),
        }),
      ]),
    );
  });
});
