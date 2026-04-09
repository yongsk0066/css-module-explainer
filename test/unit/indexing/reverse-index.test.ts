import { describe, it, expect } from "vitest";
import type { CallSite, CxBinding } from "@css-module-explainer/shared";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index.js";

function makeBinding(): CxBinding {
  return {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/a.module.scss",
    classNamesImportName: "classNames",
    scope: { startLine: 0, endLine: 100 },
  };
}

function makeCallSite(): CallSite {
  return {
    uri: "file:///fake/a.tsx",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    binding: makeBinding(),
    kind: "static",
    matchInfo: "static: indicator",
  };
}

describe("NullReverseIndex", () => {
  it("accepts record() without throwing and without storing", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite()]);
    expect(index.find("/fake/a.module.scss", "indicator")).toEqual([]);
  });

  it("count() always returns 0", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite(), makeCallSite()]);
    expect(index.count("/fake/a.module.scss", "indicator")).toBe(0);
  });

  it("forget() is a no-op", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite()]);
    index.forget("file:///fake/a.tsx");
    expect(index.find("/fake/a.module.scss", "indicator")).toEqual([]);
  });

  it("clear() is a no-op", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite()]);
    index.clear();
    expect(index.find("/fake/a.module.scss", "indicator")).toEqual([]);
  });
});
