import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import type { CxBinding } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import {
  hasAnyStyleImport,
  withSourceExpressionAtCursor,
  type ProviderDeps,
} from "../../../server/src/providers/cursor-dispatch";
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
const el2 = <div className={styles.active} />;
`;

const SCSS_PATH = "/fake/src/Button.module.scss";

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: SCSS_PATH,
    classNamesImportName: "classNames",
    scope: {
      startLine: 0,
      endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
    },
  },
];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    scanCxImports: (sf, fp) => ({
      stylesBindings: new Map([["styles", { kind: "resolved" as const, absolutePath: SCSS_PATH }]]),
      bindings: detectCxBindings(sf, fp),
    }),
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    parseClassExpressions: (_sf, bindings, stylesBindings) =>
      buildTestClassExpressions({
        filePath: "/fake/a.tsx",
        bindings,
        stylesBindings,
        expressions: [
          {
            kind: "literal",
            origin: "cxCall",
            className: "indicator",
            range: {
              start: { line: 4, character: 15 },
              end: { line: 4, character: 24 },
            },
            scssModulePath: SCSS_PATH,
          },
          {
            kind: "styleAccess",
            className: "active",
            range: {
              start: { line: 5, character: 28 },
              end: { line: 5, character: 34 },
            },
            scssModulePath: SCSS_PATH,
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
    ...overrides,
  });
}

describe("hasAnyStyleImport", () => {
  it("matches `.module.` imports", () => {
    expect(hasAnyStyleImport(`import x from './a.module.scss';`)).toBe(true);
  });

  it("matches classnames/bind imports", () => {
    expect(hasAnyStyleImport(`import cn from 'classnames/bind';`)).toBe(true);
  });

  it("returns false when neither signal is present", () => {
    expect(hasAnyStyleImport(`const x = 1;`)).toBe(false);
  });
});

describe("withSourceExpressionAtCursor / fast paths", () => {
  it("returns null when the content has no style imports at all", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withSourceExpressionAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: "const x = 1;",
        filePath: "/fake/a.tsx",
        line: 0,
        character: 0,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });

  it("returns null when class expressions are empty for an otherwise-matching file", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      scanCxImports: () => ({ stylesBindings: new Map(), bindings: [] }),
      parseClassExpressions: () => [],
      max: 10,
    });
    const deps = makeBaseDeps({
      analysisCache,
      selectorMapForPath: () => null,
      workspaceRoot: "/fake",
    });
    const transform = vi.fn();
    const result = withSourceExpressionAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX, // has `.module.` so the fast path passes
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });

  it("returns null when the cursor is outside every class expression range", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withSourceExpressionAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 1, // import line — no ref there
        character: 0,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });

  it("returns null when the style document cannot be resolved for the expression path", () => {
    const deps = makeDeps({ selectorMapForPath: () => null });
    const transform = vi.fn();
    const result = withSourceExpressionAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });
});

describe("withSourceExpressionAtCursor / dispatch", () => {
  it("passes a literal cx expression when cursor lies inside it", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ({ kind: ctx.expression.kind, origin: ctx.expression.origin }));
    const result = withSourceExpressionAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18,
        version: 1,
      },
      deps,
      spy,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: "literal", origin: "cxCall" });
  });

  it("passes a styleAccess expression when cursor is on a styles.x access", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ({ kind: ctx.expression.kind, origin: ctx.expression.origin }));
    const result = withSourceExpressionAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 5,
        character: 30, // middle of `active`
        version: 1,
      },
      deps,
      spy,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: "styleAccess", origin: "styleAccess" });
  });

  it("passes the AnalysisEntry so providers can skip a second cache lookup", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ctx.entry);
    const result = withSourceExpressionAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18,
        version: 1,
      },
      deps,
      spy,
    );
    expect(result).toBeTruthy();
    expect(
      (result as { sourceDocument: { classExpressions: readonly unknown[] } }).sourceDocument
        .classExpressions,
    ).toHaveLength(2);
  });
});
