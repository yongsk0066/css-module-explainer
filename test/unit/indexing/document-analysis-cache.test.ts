import { describe, it, expect, vi } from "vitest";
import type ts from "typescript";
import type { CxBinding, CxCallInfo } from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";

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
  const parseSpy = vi.fn((_sourceFile: ts.SourceFile, _binding: CxBinding): CxCallInfo[] => []);
  const cache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings: detectSpy,
    parseCxCalls: parseSpy,
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
    const parseSpy = vi.fn((): CxCallInfo[] => []);
    const cache = new DocumentAnalysisCache({
      sourceFileCache,
      detectCxBindings: detectSpy,
      parseCxCalls: parseSpy,
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
});
