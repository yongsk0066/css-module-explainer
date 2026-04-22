import { describe, expect, it } from "vitest";
import type ts from "typescript";
import type { CxBinding } from "../../../server/engine-core-ts/src/core/cx/cx-types";
import { SourceFileCache } from "../../../server/engine-core-ts/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/engine-core-ts/src/core/indexing/document-analysis-cache";
import { readSourceExpressionContextAtCursor } from "../../../server/engine-core-ts/src/core/query";
import type { ProviderDeps } from "../../../server/lsp-server/src/providers/cursor-dispatch";
import { resolveSourceExpressionHoverResult } from "../../../server/engine-host-node/src/source-hover-query";
import {
  EMPTY_ALIAS_RESOLVER,
  buildTestClassExpressions,
  info,
  makeBaseDeps,
} from "../../_fixtures/test-helpers";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
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

function makeDeps(): ProviderDeps {
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
                  kind: "literal",
                  origin: "cxCall",
                  className: "indicator",
                  range: {
                    start: { line: 4, character: 15 },
                    end: { line: 4, character: 24 },
                  },
                  scssModulePath: bindings[0]!.scssModulePath,
                },
              ],
      }),
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    selectorMapForPath: () => new Map([["indicator", info("indicator")]]),
    workspaceRoot: "/fake",
  });
}

describe("resolveSourceExpressionHoverResult", () => {
  it("returns selectors, explanation, and selector dependency summaries", () => {
    const deps = makeDeps();
    const params = {
      documentUri: "file:///fake/src/Button.tsx",
      content: TSX,
      filePath: "/fake/src/Button.tsx",
      line: 4,
      character: 18,
      version: 1,
    };
    const ctx = readSourceExpressionContextAtCursor(params, {
      analysisCache: deps.analysisCache,
      styleDocumentForPath: deps.styleDocumentForPath,
    });

    expect(ctx).not.toBeNull();
    const result = resolveSourceExpressionHoverResult(ctx!, params.filePath, deps);

    expect(result.selectors.map((selector) => selector.name)).toEqual(["indicator"]);
    expect(result.dynamicExplanation).toBeNull();
    expect(Array.from(result.styleDependenciesBySelector.keys())).toEqual(["indicator"]);
  });
});
