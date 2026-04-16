import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import type { CxBinding } from "../../../server/src/core/cx/cx-types";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import type { ProviderDeps } from "../../../server/adapter-vscode/src/providers/cursor-dispatch";
import { handleDefinition } from "../../../server/adapter-vscode/src/providers/definition";
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

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
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
    ...overrides,
  });
}

describe("handleDefinition", () => {
  const baseParams = {
    documentUri: "file:///fake/src/Button.tsx",
    content: TSX,
    filePath: "/fake/src/Button.tsx",
    line: 4,
    character: 18,
    version: 1,
  };

  it("returns a LocationLink pointing at the SCSS rule for a static call", () => {
    const deps = makeDeps();
    const result = handleDefinition(baseParams, deps);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    const link = result![0]!;
    expect(link.targetUri).toMatch(/Button\.module\.scss$/);
    expect(link.targetUri.startsWith("file://")).toBe(true);
    expect(link.originSelectionRange).toEqual({
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    });
    expect(link.targetRange).toEqual({
      start: { line: 10, character: 0 },
      end: { line: 13, character: 1 },
    });
    expect(link.targetSelectionRange).toEqual({
      start: { line: 11, character: 2 },
      end: { line: 11, character: 11 },
    });
  });

  it("returns null when the cursor is not on a cx call", () => {
    const deps = makeDeps();
    const result = handleDefinition({ ...baseParams, line: 1, character: 0 }, deps);
    expect(result).toBeNull();
  });

  it("returns null when classMap has no match for the class name", () => {
    const deps = makeDeps({
      selectorMapForPath: () => new Map(),
    });
    const result = handleDefinition(baseParams, deps);
    expect(result).toBeNull();
  });

  it("returns all LocationLinks for a template-literal prefix match", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: (sf, fp) => ({
        stylesBindings: new Map(),
        bindings: detectCxBindings(sf, fp),
      }),
      parseClassExpressions: (_sf, bindings) =>
        buildTestClassExpressions({
          filePath: "/fake/src/Button.tsx",
          bindings,
          expressions:
            bindings.length === 0
              ? []
              : [
                  {
                    kind: "template",
                    origin: "cxCall",
                    rawTemplate: "btn-${variant}",
                    staticPrefix: "btn-",
                    range: {
                      start: { line: 4, character: 15 },
                      end: { line: 4, character: 28 },
                    },
                    scssModulePath: bindings[0]!.scssModulePath,
                  },
                ],
        }),
      max: 10,
    });
    const deps: ProviderDeps = makeBaseDeps({
      analysisCache,
      selectorMapForPath: () =>
        new Map([
          ["btn", info("btn")],
          ["btn-primary", info("btn-primary")],
          ["btn-secondary", info("btn-secondary")],
          ["indicator", info("indicator")],
        ]),
      workspaceRoot: "/fake",
    });
    const result = handleDefinition(baseParams, deps);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.every((l) => l.targetUri.startsWith("file://"))).toBe(true);
  });

  it("logs and returns null when the underlying transform raises", () => {
    const logError = vi.fn();
    const deps = makeDeps({
      styleDocumentForPath: () => {
        throw new Error("boom");
      },
      logError,
    });
    expect(() => handleDefinition(baseParams, deps)).not.toThrow();
    expect(handleDefinition(baseParams, deps)).toBeNull();
    expect(logError).toHaveBeenCalledWith("definition handler failed", expect.any(Error));
  });
});
