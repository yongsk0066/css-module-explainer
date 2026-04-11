import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import type { ClassRef, CxBinding, ScssClassMap } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import type { ProviderDeps } from "../../../server/src/providers/cursor-dispatch";
import { handleHover } from "../../../server/src/providers/hover";
import { info, makeBaseDeps } from "../../_fixtures/test-helpers";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
`;

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/ws/src/Button.module.scss",
    classNamesImportName: "classNames",
    scope: {
      startLine: 0,
      endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
    },
  },
];

const parseClassRefs = (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
  bindings.length === 0
    ? []
    : [
        {
          kind: "static",
          origin: "cxCall",
          className: "indicator",
          originRange: { start: { line: 4, character: 15 }, end: { line: 4, character: 24 } },
          scssModulePath: bindings[0]!.scssModulePath,
        },
      ];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports: () => new Map(),
    detectCxBindings,
    parseClassRefs,
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    scssClassMapForPath: () => new Map([["indicator", info("indicator")]]) as ScssClassMap,
    ...overrides,
  });
}

describe("handleHover", () => {
  const baseParams = {
    documentUri: "file:///fake/ws/src/Button.tsx",
    content: TSX,
    filePath: "/fake/ws/src/Button.tsx",
    line: 4,
    character: 18,
    version: 1,
  };

  it("returns a Hover with markdown for a static call", () => {
    const hover = handleHover(baseParams, makeDeps());
    expect(hover).not.toBeNull();
    expect(hover!.contents).toHaveProperty("kind", "markdown");
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`.indicator`");
    expect(value).toContain("Button.module.scss");
    expect(hover!.range).toEqual({
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    });
  });

  it("resolves hover on a continuation line of a multi-line cx() call", () => {
    const multiLineTsx = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx(
  'indicator',
  { active: true },
);
`;
    const multiLineClassRefs = (_sf: ts.SourceFile, bindings: readonly CxBinding[]): ClassRef[] =>
      bindings.length === 0
        ? []
        : [
            {
              kind: "static",
              origin: "cxCall",
              className: "indicator",
              originRange: { start: { line: 5, character: 2 }, end: { line: 5, character: 13 } },
              scssModulePath: bindings[0]!.scssModulePath,
            },
          ];
    const deps = makeDeps({
      analysisCache: new DocumentAnalysisCache({
        sourceFileCache: new SourceFileCache({ max: 10 }),
        collectStyleImports: () => new Map(),
        detectCxBindings,
        parseClassRefs: multiLineClassRefs,
        max: 10,
      }),
    });
    // Cursor on line 5 (the 'indicator' line) — no "(" on this line
    const hover = handleHover(
      { ...baseParams, content: multiLineTsx, line: 5, character: 5, version: 2 },
      deps,
    );
    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain("`.indicator`");
  });

  it("returns null when the classMap has no match", () => {
    const hover = handleHover(
      baseParams,
      makeDeps({ scssClassMapForPath: () => new Map() as ScssClassMap }),
    );
    expect(hover).toBeNull();
  });

  it("logs and returns null when the underlying transform raises", () => {
    const logError = vi.fn();
    const hover = handleHover(
      baseParams,
      makeDeps({
        scssClassMapForPath: () => {
          throw new Error("boom");
        },
        logError,
      }),
    );
    expect(hover).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("hover handler failed", expect.any(Error));
  });
});

describe("handleHover / styles.x without classnames/bind (L8 fix)", () => {
  it("returns hover for styles.indicator in a clsx-only file", () => {
    const clsxTsx = `
import clsx from 'clsx';
import styles from './Button.module.scss';
const el = <div className={clsx(styles.indicator)} />;
`;
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const indicatorInfo = info("indicator");
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map([["styles", "/fake/ws/src/Button.module.scss"]]),
      detectCxBindings: () => [],
      parseClassRefs: (_sf, _bindings, stylesBindings) => {
        if (stylesBindings.has("styles")) {
          return [
            {
              kind: "static",
              origin: "styleAccess",
              className: "indicator",
              scssModulePath: "/fake/ws/src/Button.module.scss",
              originRange: { start: { line: 3, character: 39 }, end: { line: 3, character: 48 } },
            },
          ];
        }
        return [];
      },
      max: 10,
    });
    const deps = makeDeps({
      analysisCache,
      scssClassMapForPath: (path: string) => {
        if (path === "/fake/ws/src/Button.module.scss") {
          return new Map([["indicator", indicatorInfo]]) as ScssClassMap;
        }
        return null;
      },
    });

    const hover = handleHover(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: clsxTsx,
        filePath: "/fake/ws/src/Button.tsx",
        line: 3,
        character: 42,
        version: 1,
      },
      deps,
    );

    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain("`.indicator`");
  });
});
