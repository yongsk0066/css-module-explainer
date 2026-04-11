import { describe, expect, it, vi } from "vitest";
import type ts from "typescript";
import type { ClassRef, CxBinding, ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index";
import {
  hasAnyStyleImport,
  withClassRefAtCursor,
  type ProviderDeps,
} from "../../../server/src/providers/cursor-dispatch";
import { EMPTY_ALIAS_RESOLVER, makeBaseDeps } from "../../_fixtures/test-helpers";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
const el2 = <div className={styles.active} />;
`;

const SCSS_PATH = "/fake/src/Button.module.scss";

function makeInfo(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
}

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

const collectStyleImports = (): ReadonlyMap<string, string> => new Map([["styles", SCSS_PATH]]);

const parseClassRefs = (): ClassRef[] => [
  {
    kind: "static",
    origin: "cxCall",
    className: "indicator",
    originRange: {
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    },
    scssModulePath: SCSS_PATH,
  },
  {
    kind: "static",
    origin: "styleAccess",
    className: "active",
    originRange: {
      start: { line: 5, character: 28 },
      end: { line: 5, character: 34 },
    },
    scssModulePath: SCSS_PATH,
  },
];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports,
    detectCxBindings,
    parseClassRefs,
    max: 10,
  });
  return makeBaseDeps({
    analysisCache,
    scssClassMapForPath: () =>
      new Map([
        ["indicator", makeInfo("indicator")],
        ["active", makeInfo("active")],
      ]) as ScssClassMap,
    reverseIndex: new NullReverseIndex(),
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

describe("withClassRefAtCursor / fast paths", () => {
  it("returns null when the content has no style imports at all", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withClassRefAtCursor(
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

  it("returns null when classRefs is empty for an otherwise-matching file", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      detectCxBindings: () => [],
      parseClassRefs: () => [],
      max: 10,
    });
    const deps = makeBaseDeps({
      analysisCache,
      scssClassMapForPath: () => null,
      workspaceRoot: "/fake",
    });
    const transform = vi.fn();
    const result = withClassRefAtCursor(
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

  it("returns null when the cursor is outside every classRef range", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withClassRefAtCursor(
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

  it("returns null when the classMap is missing for the resolved scss path", () => {
    const deps = makeDeps({ scssClassMapForPath: () => null });
    const transform = vi.fn();
    const result = withClassRefAtCursor(
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

describe("withClassRefAtCursor / dispatch", () => {
  it("passes a ClassRefContext with a static cxCall ref when cursor lies inside it", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ({ kind: ctx.ref.kind, origin: ctx.ref.origin }));
    const result = withClassRefAtCursor(
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
    expect(result).toEqual({ kind: "static", origin: "cxCall" });
  });

  it("passes a styleAccess ClassRef when cursor is on a styles.x access", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ({ kind: ctx.ref.kind, origin: ctx.ref.origin }));
    const result = withClassRefAtCursor(
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
    expect(result).toEqual({ kind: "static", origin: "styleAccess" });
  });

  it("passes the AnalysisEntry so providers can skip a second cache lookup", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ctx.entry);
    const result = withClassRefAtCursor(
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
    expect((result as { classRefs: readonly unknown[] }).classRefs).toHaveLength(2);
  });
});
