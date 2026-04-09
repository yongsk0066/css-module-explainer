import { describe, it, expect } from "vitest";
import type { CallSite, CxBinding } from "@css-module-explainer/shared";
import {
  NullReverseIndex,
  WorkspaceReverseIndex,
} from "../../../server/src/core/indexing/reverse-index.js";

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

function siteAt(uri: string, className: string, line: number, scssPath?: string): CallSite {
  return {
    uri,
    range: {
      start: { line, character: 10 },
      end: { line, character: 10 + className.length },
    },
    binding: {
      cxVarName: "cx",
      stylesVarName: "styles",
      scssModulePath: scssPath ?? "/fake/a.module.scss",
      classNamesImportName: "classNames",
      scope: { startLine: 0, endLine: 100 },
    },
    kind: "static",
    matchInfo: `static: ${className}`,
  };
}

describe("WorkspaceReverseIndex", () => {
  it("stores static calls keyed by (scssPath, className)", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [
      siteAt("file:///a.tsx", "indicator", 5),
      siteAt("file:///a.tsx", "active", 7),
    ]);
    expect(index.count("/fake/a.module.scss", "indicator")).toBe(1);
    expect(index.count("/fake/a.module.scss", "active")).toBe(1);
    expect(index.find("/fake/a.module.scss", "indicator")).toHaveLength(1);
  });

  it("accumulates contributions from multiple documents", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [siteAt("file:///a.tsx", "indicator", 5)]);
    index.record("file:///b.tsx", [siteAt("file:///b.tsx", "indicator", 9)]);
    expect(index.count("/fake/a.module.scss", "indicator")).toBe(2);
    const sites = index.find("/fake/a.module.scss", "indicator");
    expect(sites.map((s) => s.uri).toSorted()).toEqual(["file:///a.tsx", "file:///b.tsx"]);
  });

  it("record(uri, ...) replaces the prior contribution for that uri", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [
      siteAt("file:///a.tsx", "indicator", 5),
      siteAt("file:///a.tsx", "active", 7),
    ]);
    index.record("file:///a.tsx", [siteAt("file:///a.tsx", "indicator", 15)]);
    expect(index.count("/fake/a.module.scss", "indicator")).toBe(1);
    expect(index.find("/fake/a.module.scss", "indicator")[0]!.range.start.line).toBe(15);
    expect(index.count("/fake/a.module.scss", "active")).toBe(0);
  });

  it("forget(uri) drops only that uri, leaves sibling documents", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [siteAt("file:///a.tsx", "indicator", 5)]);
    index.record("file:///b.tsx", [siteAt("file:///b.tsx", "indicator", 9)]);
    index.forget("file:///a.tsx");
    const remaining = index.find("/fake/a.module.scss", "indicator");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.uri).toBe("file:///b.tsx");
  });

  it("skips non-static call kinds (Phase Final scope decision)", () => {
    const index = new WorkspaceReverseIndex();
    const templateSite: CallSite = {
      ...siteAt("file:///a.tsx", "btn-", 3),
      kind: "template",
      matchInfo: "prefix: btn-",
    };
    index.record("file:///a.tsx", [templateSite]);
    expect(index.count("/fake/a.module.scss", "btn-")).toBe(0);
  });

  it("clear() drops every contribution", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [siteAt("file:///a.tsx", "indicator", 5)]);
    index.clear();
    expect(index.count("/fake/a.module.scss", "indicator")).toBe(0);
  });

  it("partitions call sites by scssModulePath", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [
      siteAt("file:///a.tsx", "indicator", 5, "/fake/a.module.scss"),
      siteAt("file:///a.tsx", "indicator", 6, "/fake/b.module.scss"),
    ]);
    expect(index.count("/fake/a.module.scss", "indicator")).toBe(1);
    expect(index.count("/fake/b.module.scss", "indicator")).toBe(1);
  });
});
