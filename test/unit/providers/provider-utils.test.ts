import { describe, it, expect, vi } from "vitest";
import type ts from "typescript";
import type {
  CxBinding,
  CxCallInfo,
  ResolvedType,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index.js";
import type { TypeResolver } from "../../../server/src/core/ts/type-resolver.js";
import {
  NOOP_LOG_ERROR,
  withCxCallAtCursor,
  type ProviderDeps,
} from "../../../server/src/providers/cursor-dispatch.js";
import { isInsideCxCall } from "../../../server/src/providers/completion.js";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
`;

function makeInfo(name: string): SelectorInfo {
  return {
    name,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
}

class FakeTypeResolver implements TypeResolver {
  resolve(): ResolvedType {
    return { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/src/Button.module.scss",
    classNamesImportName: "classNames",
    scope: {
      startLine: 0,
      endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
    },
  },
];

const parseCxCalls = (_sf: ts.SourceFile, binding: CxBinding): CxCallInfo[] => [
  {
    kind: "static",
    className: "indicator",
    // Synthetic range: the test TSX has `cx('indicator')` with
    // `'indicator'` starting at column 15 on line 4, length 9.
    originRange: {
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    },
    binding,
  },
];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings,
    parseCxCalls,
    max: 10,
  });
  return {
    analysisCache,
    scssClassMapFor: () => new Map([["indicator", makeInfo("indicator")]]) as ScssClassMap,
    scssClassMapForPath: () => null,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake",
    logError: NOOP_LOG_ERROR,
    ...overrides,
  };
}

describe("isInsideCxCall", () => {
  it("returns true when the last cx( is still open on the line", () => {
    expect(isInsideCxCall("const x = cx('abc", "cx")).toBe(true);
  });

  it("returns false when the cx call is already closed", () => {
    expect(isInsideCxCall("const x = cx('abc')", "cx")).toBe(false);
  });

  it("returns false when there is no cx call on the line", () => {
    expect(isInsideCxCall("const x = 1", "cx")).toBe(false);
  });

  it("handles nested parens correctly", () => {
    expect(isInsideCxCall("cx(isActive && 'on'", "cx")).toBe(true);
    expect(isInsideCxCall("cx(isActive && 'on')", "cx")).toBe(false);
  });

  it("handles an object literal inside the call", () => {
    expect(isInsideCxCall("cx({ active", "cx")).toBe(true);
    expect(isInsideCxCall("cx({ active: true", "cx")).toBe(true);
    expect(isInsideCxCall("cx({ active: true })", "cx")).toBe(false);
  });

  it("ignores a cx call from earlier on the same line", () => {
    expect(isInsideCxCall("const a = cx('b'); const c = cx('d", "cx")).toBe(true);
  });

  it("respects custom variable names", () => {
    expect(isInsideCxCall("const x = classes('abc", "classes")).toBe(true);
    expect(isInsideCxCall("const x = cx('abc", "classes")).toBe(false);
  });
});

describe("withCxCallAtCursor / fast paths", () => {
  it("returns null when content does not import classnames/bind", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withCxCallAtCursor(
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

  it("returns null when the cursor line has no parenthesis", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 1, // `import classNames from 'classnames/bind';`
        character: 0,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });
});

describe("withCxCallAtCursor / call dispatch", () => {
  it("passes a CxCallContext to transform when the cursor is on a known call", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ({ hit: ctx.call.kind }));
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18, // middle of 'indicator'
        version: 1,
      },
      deps,
      spy,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ hit: "static" });
  });

  it("returns null when the cursor is in a file with bindings but outside any call", () => {
    const deps = makeDeps();
    const transform = vi.fn();
    const result = withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 3, // `const cx = classNames.bind(styles);` — has `(` but no call at cursor
        character: 0,
        version: 1,
      },
      deps,
      transform,
    );
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });

  it("passes the AnalysisEntry so providers can read sourceFile without a second cache lookup", () => {
    const deps = makeDeps();
    const spy = vi.fn((ctx) => ctx.entry);
    const result = withCxCallAtCursor(
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
    expect((result as { bindings: unknown[] }).bindings).toHaveLength(1);
  });

  it("no longer records into the reverse index on every call (Plan Final invariant 3.6)", () => {
    // Plan Final moved the reverse-index write off the provider
    // hot path and into `DocumentAnalysisCache.onAnalyze` — see
    // composition-root.ts. withCxCallAtCursor must not touch the
    // reverseIndex at all. A recording subclass would stay at
    // zero calls if the invariant holds.
    const records: Array<[string, readonly unknown[]]> = [];
    class RecordingReverseIndex extends NullReverseIndex {
      override record(uri: string, sites: readonly unknown[]): void {
        records.push([uri, sites]);
      }
    }
    const deps = makeDeps({ reverseIndex: new RecordingReverseIndex() });
    withCxCallAtCursor(
      {
        documentUri: "file:///fake/a.tsx",
        content: TSX,
        filePath: "/fake/a.tsx",
        line: 4,
        character: 18,
        version: 1,
      },
      deps,
      () => "hit",
    );
    expect(records).toHaveLength(0);
  });
});
