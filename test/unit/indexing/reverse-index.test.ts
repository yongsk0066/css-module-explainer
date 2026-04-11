import { describe, it, expect } from "vitest";
import type { CallSite, CxBinding, StylePropertyRef } from "@css-module-explainer/shared";
import {
  collectCallSites,
  NullReverseIndex,
  WorkspaceReverseIndex,
} from "../../../server/src/core/indexing/reverse-index";
import type { AnalysisEntry } from "../../../server/src/core/indexing/document-analysis-cache";
import ts from "typescript";

function makeCallSite(): CallSite {
  return {
    uri: "file:///fake/a.tsx",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    scssModulePath: "/fake/a.module.scss",
    match: { kind: "static", className: "indicator" },
    expansion: "direct",
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

  it("findAllForScssPath() always returns []", () => {
    const index = new NullReverseIndex();
    index.record("file:///fake/a.tsx", [makeCallSite()]);
    expect(index.findAllForScssPath("/fake/a.module.scss")).toEqual([]);
  });
});

function siteAt(uri: string, className: string, line: number, scssPath?: string): CallSite {
  return {
    uri,
    range: {
      start: { line, character: 10 },
      end: { line, character: 10 + className.length },
    },
    scssModulePath: scssPath ?? "/fake/a.module.scss",
    match: { kind: "static", className },
    expansion: "direct",
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

  it("skips non-static call kinds without resolver context", () => {
    const index = new WorkspaceReverseIndex();
    const templateSite: CallSite = {
      ...siteAt("file:///a.tsx", "btn-", 3),
      match: { kind: "template", staticPrefix: "btn-" },
      expansion: "direct",
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

  it("findAllForScssPath returns all sites for a given scssPath across class names", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [
      siteAt("file:///a.tsx", "indicator", 5),
      siteAt("file:///a.tsx", "active", 7),
    ]);
    index.record("file:///b.tsx", [siteAt("file:///b.tsx", "indicator", 9)]);
    const all = index.findAllForScssPath("/fake/a.module.scss");
    expect(all).toHaveLength(3);
    const classNames = all.map((s) => {
      if (s.match.kind === "static") return s.match.className;
      return s.match.kind;
    });
    expect(classNames.toSorted()).toEqual(["active", "indicator", "indicator"]);
  });

  it("findAllForScssPath returns [] for unknown scssPath", () => {
    const index = new WorkspaceReverseIndex();
    index.record("file:///a.tsx", [siteAt("file:///a.tsx", "indicator", 5)]);
    expect(index.findAllForScssPath("/fake/nonexistent.module.scss")).toEqual([]);
  });

  it("findAllForScssPath includes non-static call kinds", () => {
    const index = new WorkspaceReverseIndex();
    const templateSite: CallSite = {
      uri: "file:///a.tsx",
      range: { start: { line: 3, character: 10 }, end: { line: 3, character: 14 } },
      scssModulePath: "/fake/a.module.scss",
      match: { kind: "template", staticPrefix: "btn-" },
      expansion: "direct",
    };
    index.record("file:///a.tsx", [siteAt("file:///a.tsx", "indicator", 5), templateSite]);
    const all = index.findAllForScssPath("/fake/a.module.scss");
    expect(all.some((s) => s.match.kind === "static")).toBe(true);
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

describe("CallSite carries scssModulePath directly", () => {
  it("CallSite carries scssModulePath directly (no binding wrapper)", () => {
    const site: CallSite = {
      uri: "file:///a.tsx",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      scssModulePath: "/fake/a.module.scss",
      match: { kind: "static", className: "btn" },
      expansion: "direct",
    };
    const index = new WorkspaceReverseIndex();
    index.record(site.uri, [site]);
    expect(index.find("/fake/a.module.scss", "btn")).toHaveLength(1);
    expect(index.find("/fake/a.module.scss", "btn")[0]!.scssModulePath).toBe("/fake/a.module.scss");
  });
});

describe("collectCallSites / StylePropertyRef entries", () => {
  it("creates static CallSite entries from entry.styleRefs", () => {
    const sourceFile = ts.createSourceFile("test.tsx", "", ts.ScriptTarget.Latest, true);
    const styleRef: StylePropertyRef = {
      kind: "style-access",
      className: "indicator",
      scssModulePath: "/fake/a.module.scss",
      stylesVarName: "styles",
      originRange: {
        start: { line: 5, character: 10 },
        end: { line: 5, character: 19 },
      },
    };
    const entry: AnalysisEntry = {
      version: 1,
      contentHash: "abc",
      sourceFile,
      bindings: [],
      calls: [],
      styleRefs: [styleRef],
      classRefs: [],
      stylesBindings: new Map(),
    };

    const sites = collectCallSites("file:///fake/a.tsx", entry);

    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      uri: "file:///fake/a.tsx",
      range: { start: { line: 5, character: 10 }, end: { line: 5, character: 19 } },
      match: { kind: "static", className: "indicator" },
    });
    expect(sites[0]!.scssModulePath).toBe("/fake/a.module.scss");
  });

  it("merges cx call sites and styleRef sites", () => {
    const sourceFile = ts.createSourceFile("test.tsx", "", ts.ScriptTarget.Latest, true);
    const binding: CxBinding = {
      cxVarName: "cx",
      stylesVarName: "styles",
      scssModulePath: "/fake/a.module.scss",
      classNamesImportName: "classNames",
      scope: { startLine: 0, endLine: 100 },
    };
    const entry: AnalysisEntry = {
      version: 1,
      contentHash: "abc",
      sourceFile,
      bindings: [binding],
      calls: [
        {
          kind: "static",
          className: "active",
          originRange: { start: { line: 3, character: 4 }, end: { line: 3, character: 10 } },
          scssModulePath: binding.scssModulePath,
        },
      ],
      styleRefs: [
        {
          kind: "style-access",
          className: "indicator",
          scssModulePath: "/fake/a.module.scss",
          stylesVarName: "styles",
          originRange: { start: { line: 7, character: 10 }, end: { line: 7, character: 19 } },
        },
      ],
      classRefs: [],
      stylesBindings: new Map(),
    };

    const sites = collectCallSites("file:///fake/a.tsx", entry);

    expect(sites).toHaveLength(2);
    const classNames = sites
      .filter((s) => s.match.kind === "static")
      .map((s) => (s.match as { className: string }).className)
      .toSorted();
    expect(classNames).toEqual(["active", "indicator"]);
  });

  it("reverse index find() returns styleRef sites", () => {
    const sourceFile = ts.createSourceFile("test.tsx", "", ts.ScriptTarget.Latest, true);
    const entry: AnalysisEntry = {
      version: 1,
      contentHash: "abc",
      sourceFile,
      bindings: [],
      calls: [],
      styleRefs: [
        {
          kind: "style-access",
          className: "btn",
          scssModulePath: "/fake/a.module.scss",
          stylesVarName: "styles",
          originRange: { start: { line: 2, character: 5 }, end: { line: 2, character: 8 } },
        },
      ],
      classRefs: [],
      stylesBindings: new Map(),
    };

    const sites = collectCallSites("file:///fake/a.tsx", entry);
    const index = new WorkspaceReverseIndex();
    index.record("file:///fake/a.tsx", sites);

    expect(index.count("/fake/a.module.scss", "btn")).toBe(1);
    const found = index.find("/fake/a.module.scss", "btn");
    expect(found).toHaveLength(1);
    expect(found[0]!.uri).toBe("file:///fake/a.tsx");
    expect(found[0]!.range.start.line).toBe(2);
  });
});
