import { describe, it, expect, vi } from "vitest";
import type ts from "typescript";
import type { ClassRef, CxBinding, StyleImport } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache";
import { EMPTY_ALIAS_RESOLVER } from "../../_fixtures/test-helpers";

const SOURCE = `
  import classNames from 'classnames/bind';
  import styles from './Button.module.scss';
  const cx = classNames.bind(styles);
  const el = cx('indicator');
`;

function makeCache() {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const detectSpy = vi.fn((sourceFile: ts.SourceFile, _filePath: string): CxBinding[] => {
    return [
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
  });
  const parseSpy = vi.fn(
    (_sourceFile: ts.SourceFile, _bindings: readonly CxBinding[]): ClassRef[] => [],
  );
  const cache = new DocumentAnalysisCache({
    sourceFileCache,
    collectStyleImports: () => new Map(),
    fileExists: () => true,
    aliasResolver: EMPTY_ALIAS_RESOLVER,
    detectCxBindings: detectSpy,
    parseClassRefs: parseSpy,
    max: 10,
  });
  return { cache, detectSpy, parseSpy, sourceFileCache };
}

describe("DocumentAnalysisCache", () => {
  it("analyzes a document on the first get and caches the entry", () => {
    const { cache, detectSpy, parseSpy } = makeCache();
    const entry = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(entry.bindings).toHaveLength(1);
    expect(detectSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("returns the same entry when (uri, version) matches", () => {
    const { cache, detectSpy } = makeCache();
    const first = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    const second = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(second).toBe(first);
    expect(detectSpy).toHaveBeenCalledTimes(1);
  });

  it("returns an entry via content-hash fallback when version bumps but content is identical", () => {
    const { cache, detectSpy } = makeCache();
    const first = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    const second = cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 2);
    // Not reference-equal because the entry is upgraded with a
    // new version field, but the underlying parse result is
    // preserved — detectSpy stays at one call.
    expect(second.bindings).toBe(first.bindings);
    expect(second.sourceFile).toBe(first.sourceFile);
    expect(second.version).toBe(2);
    expect(detectSpy).toHaveBeenCalledTimes(1);
  });

  it("re-analyzes when content changes", () => {
    const { cache, detectSpy } = makeCache();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    cache.get("file:///fake/a.tsx", `${SOURCE}\nconst y = cx('extra');`, "/fake/a.tsx", 2);
    expect(detectSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidate(uri) drops the cached entry and the underlying source file", () => {
    const { cache, detectSpy, sourceFileCache } = makeCache();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    const invalidate = vi.spyOn(sourceFileCache, "invalidate");
    cache.invalidate("file:///fake/a.tsx");
    expect(invalidate).toHaveBeenCalledWith("/fake/a.tsx");
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(detectSpy).toHaveBeenCalledTimes(2);
  });

  it("clear() drops every entry", () => {
    const { cache, detectSpy } = makeCache();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    cache.get("file:///fake/b.tsx", SOURCE, "/fake/b.tsx", 1);
    cache.clear();
    cache.get("file:///fake/a.tsx", SOURCE, "/fake/a.tsx", 1);
    expect(detectSpy).toHaveBeenCalledTimes(3);
  });

  it("evicts the LRU entry beyond the max", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const detectSpy = vi.fn((): CxBinding[] => []);
    const parseSpy = vi.fn((): ClassRef[] => []);
    const cache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      detectCxBindings: detectSpy,
      parseClassRefs: parseSpy,
      max: 2,
    });
    cache.get("file:///a.tsx", "const a = 1;", "/a.tsx", 1);
    cache.get("file:///b.tsx", "const b = 2;", "/b.tsx", 1);
    cache.get("file:///a.tsx", "const a = 1;", "/a.tsx", 1); // touch a
    cache.get("file:///c.tsx", "const c = 3;", "/c.tsx", 1); // evict b
    detectSpy.mockClear();
    cache.get("file:///b.tsx", "const b = 2;", "/b.tsx", 1);
    expect(detectSpy).toHaveBeenCalledTimes(1);
  });

  it("re-puts the same uri under LRU pressure without evicting a touched sibling (post-review coverage)", () => {
    // Exercises the `entries.has(uri)` branch inside put(): when a
    // cached uri is re-analyzed with changed content, we delete+
    // re-insert rather than evict a different key.
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const detectSpy = vi.fn((): CxBinding[] => []);
    const parseSpy = vi.fn((): ClassRef[] => []);
    const cache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      detectCxBindings: detectSpy,
      parseClassRefs: parseSpy,
      max: 2,
    });
    cache.get("file:///a.tsx", "const a = 1;", "/a.tsx", 1);
    cache.get("file:///b.tsx", "const b = 2;", "/b.tsx", 1);
    // Same uri (a.tsx) with changed content — hits put() with
    // entries.has(uri) === true, should NOT evict b.
    cache.get("file:///a.tsx", "const a = 2;", "/a.tsx", 2);
    detectSpy.mockClear();
    // If b was evicted we would re-analyze here. Expectation: no
    // re-analysis because b is still in the cache.
    cache.get("file:///b.tsx", "const b = 2;", "/b.tsx", 1);
    expect(detectSpy).not.toHaveBeenCalled();
  });

  it("invalidates an uncached uri via the fileURLToPath fallback (post-review coverage)", () => {
    // Exercises the fallback branch in invalidate() when no
    // AnalysisEntry exists for the uri. The SourceFileCache might
    // still hold the entry under the derived path.
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const detectSpy = vi.fn((): CxBinding[] => []);
    const parseSpy = vi.fn((): ClassRef[] => []);
    const cache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      detectCxBindings: detectSpy,
      parseClassRefs: parseSpy,
      max: 10,
    });
    const sfcInvalidate = vi.spyOn(sourceFileCache, "invalidate");
    cache.invalidate("file:///never/seen.tsx");
    expect(sfcInvalidate).toHaveBeenCalledWith("/never/seen.tsx");
  });

  it("swallows a malformed uri in invalidate without throwing (post-review coverage)", () => {
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const cache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: () => new Map(),
      fileExists: () => true,
      aliasResolver: EMPTY_ALIAS_RESOLVER,
      detectCxBindings: (): CxBinding[] => [],
      parseClassRefs: (): ClassRef[] => [],
      max: 10,
    });
    expect(() => cache.invalidate("not::a::uri")).not.toThrow();
  });
});

describe("DocumentAnalysisCache / styleAccess without classnames/bind", () => {
  it("populates classRefs from parseClassRefs for a file with style imports but no classnames/bind", () => {
    const clsxSource = `
      import clsx from 'clsx';
      import styles from './Button.module.scss';
      const el = <div className={clsx(styles.indicator)} />;
    `;
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const detectSpy = vi.fn((): CxBinding[] => []);
    const styleRef: ClassRef = {
      kind: "static",
      origin: "styleAccess",
      className: "indicator",
      scssModulePath: "/fake/src/Button.module.scss",
      originRange: { start: { line: 3, character: 42 }, end: { line: 3, character: 51 } },
    };
    const parseClassRefsSpy = vi.fn(
      (
        _sf: ts.SourceFile,
        _bindings: readonly CxBinding[],
        stylesBindings: ReadonlyMap<string, StyleImport>,
      ): ClassRef[] => {
        if (stylesBindings.size > 0 && stylesBindings.has("styles")) return [styleRef];
        return [];
      },
    );
    const collectStyleImportsSpy = vi.fn(
      (_sf: ts.SourceFile, _filePath: string): ReadonlyMap<string, StyleImport> => {
        return new Map([
          ["styles", { kind: "resolved", absolutePath: "/fake/src/Button.module.scss" }],
        ]);
      },
    );

    const cache = new DocumentAnalysisCache({
      sourceFileCache,
      collectStyleImports: collectStyleImportsSpy,
      detectCxBindings: detectSpy,
      parseClassRefs: parseClassRefsSpy,
      max: 10,
    });

    const entry = cache.get("file:///fake/a.tsx", clsxSource, "/fake/a.tsx", 1);

    // styleAccess refs must be populated even though detectCxBindings returned []
    expect(entry.bindings).toHaveLength(0);
    expect(entry.classRefs).toHaveLength(1);
    expect(entry.classRefs[0]).toMatchObject({
      kind: "static",
      origin: "styleAccess",
      className: "indicator",
      scssModulePath: "/fake/src/Button.module.scss",
    });
    expect(collectStyleImportsSpy).toHaveBeenCalledTimes(1);
    expect(parseClassRefsSpy).toHaveBeenCalledTimes(1);
    // Verify parseClassRefs received the map from collectStyleImports
    expect(parseClassRefsSpy.mock.calls[0]![2].get("styles")).toEqual({
      kind: "resolved",
      absolutePath: "/fake/src/Button.module.scss",
    });
  });
});
