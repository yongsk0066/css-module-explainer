import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import type { CxBinding } from "../../../server/engine-core-ts/src/core/cx/cx-types";
import { SourceFileCache } from "../../../server/engine-core-ts/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/engine-core-ts/src/core/indexing/document-analysis-cache";
import type { ProviderDeps } from "../../../server/adapter-vscode/src/providers/cursor-dispatch";
import { handleHover } from "../../../server/adapter-vscode/src/providers/hover";
import { FakeTypeResolver } from "../../_fixtures/fake-type-resolver";
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
    scssModulePath: "/fake/ws/src/Button.module.scss",
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
        filePath: "/fake/ws/src/Button.tsx",
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
    const deps = makeDeps({
      analysisCache: new DocumentAnalysisCache({
        sourceFileCache: new SourceFileCache({ max: 10 }),
        fileExists: () => true,
        aliasResolver: EMPTY_ALIAS_RESOLVER,
        scanCxImports: (sf, fp) => ({
          stylesBindings: new Map(),
          bindings: detectCxBindings(sf, fp),
        }),
        parseClassExpressions: (_sf, bindings) =>
          buildTestClassExpressions({
            filePath: "/fake/ws/src/Button.tsx",
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
                        start: { line: 5, character: 2 },
                        end: { line: 5, character: 13 },
                      },
                      scssModulePath: bindings[0]!.scssModulePath,
                    },
                  ],
          }),
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
    const hover = handleHover(baseParams, makeDeps({ selectorMapForPath: () => new Map() }));
    expect(hover).toBeNull();
  });

  it("includes dynamic hover explanation for symbol refs resolved from type unions", () => {
    const unionTsx = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const size = choose();
const el = cx(size);
`;
    const deps = makeDeps({
      analysisCache: new DocumentAnalysisCache({
        sourceFileCache: new SourceFileCache({ max: 10 }),
        fileExists: () => true,
        aliasResolver: EMPTY_ALIAS_RESOLVER,
        scanCxImports: (sf, fp) => ({
          stylesBindings: new Map(),
          bindings: detectCxBindings(sf, fp),
        }),
        parseClassExpressions: (_sf, bindings) =>
          buildTestClassExpressions({
            filePath: "/fake/ws/src/Button.tsx",
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
                        start: { line: 5, character: 14 },
                        end: { line: 5, character: 18 },
                      },
                      scssModulePath: bindings[0]!.scssModulePath,
                    },
                  ],
          }),
        max: 10,
      }),
      selectorMapForPath: () =>
        new Map([
          ["indicator", info("indicator")],
          ["active", info("active")],
        ]),
      typeResolver: new FakeTypeResolver(["indicator", "active"]),
    });

    const hover = handleHover(
      {
        ...baseParams,
        content: unionTsx,
        line: 5,
        character: 16,
        version: 2,
      },
      deps,
    );

    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("Resolved from `size` via TypeScript string-literal union analysis.");
    expect(value).toContain("Value certainty: inferred.");
    expect(value).toContain(
      "Value certainty reason: TypeScript exposed multiple string-literal candidates.",
    );
    expect(value).toContain("Selector certainty: exact.");
    expect(value).toContain("Value domain: finite set (2).");
    expect(value).toContain("Candidates: `active`, `indicator`.");
  });

  it("logs and returns null when the underlying transform raises", () => {
    const logError = vi.fn();
    const hover = handleHover(
      baseParams,
      makeDeps({
        styleDocumentForPath: () => {
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
      scanCxImports: () => ({
        stylesBindings: new Map([
          [
            "styles",
            { kind: "resolved" as const, absolutePath: "/fake/ws/src/Button.module.scss" },
          ],
        ]),
        bindings: [],
      }),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      parseClassExpressions: (_sf, _bindings, stylesBindings) =>
        buildTestClassExpressions({
          filePath: "/fake/ws/src/Button.tsx",
          stylesBindings,
          bindings: [],
          expressions: stylesBindings.has("styles")
            ? [
                {
                  kind: "styleAccess",
                  className: "indicator",
                  scssModulePath: "/fake/ws/src/Button.module.scss",
                  range: {
                    start: { line: 3, character: 39 },
                    end: { line: 3, character: 48 },
                  },
                },
              ]
            : [],
        }),
      max: 10,
    });
    const deps = makeDeps({
      analysisCache,
      selectorMapForPath: (path: string) => {
        if (path === "/fake/ws/src/Button.module.scss") {
          return new Map([["indicator", indicatorInfo]]);
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

  it("returns hover for styles['btn-primary'] bracket access", async () => {
    const { parseClassExpressions } =
      await import("../../../server/engine-core-ts/src/core/cx/class-ref-parser");
    const { scanCxImports } =
      await import("../../../server/engine-core-ts/src/core/cx/binding-detector");
    const bracketTsx = `
import styles from './Button.module.scss';
const el = <div className={styles['btn-primary']} />;
`;
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const btnInfo = info("btn-primary");
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      scanCxImports,
      parseClassExpressions,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      max: 10,
    });
    const deps = makeDeps({
      analysisCache,
      selectorMapForPath: (path: string) => {
        if (path === "/fake/ws/src/Button.module.scss") {
          return new Map([["btn-primary", btnInfo]]);
        }
        return null;
      },
    });

    const hover = handleHover(
      {
        documentUri: "file:///fake/ws/src/Button.tsx",
        content: bracketTsx,
        filePath: "/fake/ws/src/Button.tsx",
        line: 2,
        character: 35,
        version: 1,
      },
      deps,
    );

    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain("`.btn-primary`");
  });
});
