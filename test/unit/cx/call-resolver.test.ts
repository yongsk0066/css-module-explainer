import { describe, it, expect } from "vitest";
import type {
  ClassRef,
  CxBinding,
  Range,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import type { ResolvedType } from "@css-module-explainer/shared";
import type { TypeResolver } from "../../../server/src/core/ts/type-resolver";
import { resolveCxCallToSelectorInfos } from "../../../server/src/core/cx/call-resolver";

/**
 * Per-variable FakeTypeResolver: resolves specific variable names
 * to specific types. Used only by call-resolver tests where each
 * test needs a different resolve() result per variable name.
 */
class FakeTypeResolver implements TypeResolver {
  private readonly map: Record<string, ResolvedType>;
  constructor(map: Record<string, ResolvedType> = {}) {
    this.map = map;
  }
  resolve(_filePath: string, variableName: string): ResolvedType {
    return this.map[variableName] ?? { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

const ZERO: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

function makeInfo(name: string): SelectorInfo {
  return {
    name,
    range: ZERO,
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: ZERO,
  };
}

function makeClassMap(names: string[]): ScssClassMap {
  return new Map(names.map((n) => [n, makeInfo(n)]));
}

function makeBinding(): CxBinding {
  return {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/a.module.scss",
    classNamesImportName: "classNames",
    scope: { startLine: 0, endLine: 100 },
  };
}

describe("resolveCxCallToSelectorInfos / static", () => {
  it("returns the matching class for a static call", () => {
    const classMap = makeClassMap(["btn", "active"]);
    const call: ClassRef = {
      kind: "static",
      origin: "cxCall",
      className: "btn",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name)).toEqual(["btn"]);
  });

  it("returns [] when a static class is missing from the class map", () => {
    const classMap = makeClassMap(["btn"]);
    const call: ClassRef = {
      kind: "static",
      origin: "cxCall",
      className: "nope",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result).toEqual([]);
  });
});

describe("resolveCxCallToSelectorInfos / template", () => {
  it("returns every class whose name starts with the static prefix", () => {
    const classMap = makeClassMap(["weight-light", "weight-normal", "weight-bold", "unrelated"]);
    const call: ClassRef = {
      kind: "template",
      origin: "cxCall",
      rawTemplate: "`weight-${w}`",
      staticPrefix: "weight-",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    const names = result.map((i) => i.name).toSorted();
    expect(names).toEqual(["weight-bold", "weight-light", "weight-normal"]);
  });

  it("returns [] when no class matches the prefix", () => {
    const classMap = makeClassMap(["btn", "link"]);
    const call: ClassRef = {
      kind: "template",
      origin: "cxCall",
      rawTemplate: "`size-${s}`",
      staticPrefix: "size-",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result).toEqual([]);
  });

  it("returns every class when the static prefix is empty", () => {
    // `cx(`${name}-suffix`)` — staticPrefix is empty so every
    // class starts with it. Matches every class in the map.
    const classMap = makeClassMap(["a", "b"]);
    const call: ClassRef = {
      kind: "template",
      origin: "cxCall",
      rawTemplate: "`${name}-suffix`",
      staticPrefix: "",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name).toSorted()).toEqual(["a", "b"]);
  });
});

describe("resolveCxCallToSelectorInfos / variable", () => {
  it("resolves a union variable to each existing class", () => {
    const classMap = makeClassMap(["small", "medium", "large"]);
    const call: ClassRef = {
      kind: "variable",
      origin: "cxCall",
      variableName: "size",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({
        size: { kind: "union", values: ["small", "medium", "large"] },
      }),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name).toSorted()).toEqual(["large", "medium", "small"]);
  });

  it("drops union members that are missing from the class map", () => {
    // Partial mismatch: the resolver returns a superset of what
    // the class map has. call-resolver filters undefined lookups
    // silently; the diagnostic layer handles reporting when
    // reportPartialUnionMismatch is enabled.
    const classMap = makeClassMap(["small", "medium"]);
    const call: ClassRef = {
      kind: "variable",
      origin: "cxCall",
      variableName: "size",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({
        size: { kind: "union", values: ["small", "medium", "large"] },
      }),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result.map((i) => i.name).toSorted()).toEqual(["medium", "small"]);
  });

  it("returns [] for an unresolvable variable", () => {
    const classMap = makeClassMap(["small"]);
    const call: ClassRef = {
      kind: "variable",
      origin: "cxCall",
      variableName: "x",
      originRange: ZERO,
      scssModulePath: makeBinding().scssModulePath,
    };
    const result = resolveCxCallToSelectorInfos({
      call,
      classMap,
      typeResolver: new FakeTypeResolver({}),
      filePath: "/fake/a.tsx",
      workspaceRoot: "/fake",
    });
    expect(result).toEqual([]);
  });
});
