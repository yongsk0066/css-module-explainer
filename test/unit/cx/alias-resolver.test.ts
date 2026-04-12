import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { AliasResolver } from "../../../server/src/core/cx/alias-resolver";

const WORKSPACE = "/fake/ws";

describe("AliasResolver", () => {
  it("empty config returns null for every specifier", () => {
    const r = new AliasResolver(WORKSPACE, {});
    expect(r.resolve("@styles/button")).toBeNull();
    expect(r.resolve("anything")).toBeNull();
  });

  it("resolves `@styles/button` with a relative target", () => {
    const r = new AliasResolver(WORKSPACE, { "@styles": "src/styles" });
    expect(r.resolve("@styles/button")).toBe(path.resolve(WORKSPACE, "src/styles/button"));
  });

  it("passes absolute targets through untouched", () => {
    const r = new AliasResolver(WORKSPACE, { "@shared": "/Users/me/shared" });
    expect(r.resolve("@shared/x")).toBe("/Users/me/shared/x");
  });

  it("substitutes ${workspaceFolder} at construction time", () => {
    const r = new AliasResolver(WORKSPACE, { "@s": "${workspaceFolder}/src" });
    expect(r.resolve("@s/x")).toBe(path.resolve(WORKSPACE, "src/x"));
  });

  it("longest-prefix match: @styles wins over @", () => {
    const r = new AliasResolver(WORKSPACE, {
      "@": "src",
      "@styles": "src/styles",
    });
    expect(r.resolve("@styles/button")).toBe(path.resolve(WORKSPACE, "src/styles/button"));
  });

  it("longest-prefix tie-break: lexical order among same-length prefixes", () => {
    const r = new AliasResolver(WORKSPACE, { "@a": "x", "@b": "y" });
    expect(r.resolve("@a/foo")).toBe(path.resolve(WORKSPACE, "x/foo"));
    expect(r.resolve("@b/foo")).toBe(path.resolve(WORKSPACE, "y/foo"));
  });

  it("exact-prefix match (specifier === prefix)", () => {
    const r = new AliasResolver(WORKSPACE, {
      "@styles": "src/index.module.scss",
    });
    expect(r.resolve("@styles")).toBe(path.resolve(WORKSPACE, "src/index.module.scss"));
  });

  it("trailing slash in prefix is normalized", () => {
    const r = new AliasResolver(WORKSPACE, { "@styles/": "src/styles" });
    expect(r.resolve("@styles/button")).toBe(path.resolve(WORKSPACE, "src/styles/button"));
  });

  it("non-matching specifier returns null", () => {
    const r = new AliasResolver(WORKSPACE, { "@styles": "src/styles" });
    expect(r.resolve("lodash")).toBeNull();
  });

  it("longest-prefix wins over generic prefixes even when key order is broad-first", () => {
    // Config listed in {"@", "@styles"} order: insertion-order
    // matching would pick `@` for `@styles/button`, but the resolver
    // intentionally uses the most specific prefix. A bare `@/button`
    // specifier still routes through the `@` prefix after normalization.
    const r = new AliasResolver(WORKSPACE, {
      "@": "src",
      "@styles": "src/styles",
    });
    expect(r.resolve("@styles/button")).toBe(path.resolve(WORKSPACE, "src/styles/button"));
    expect(r.resolve("@/button")).toBe(path.resolve(WORKSPACE, "src/button"));
  });

  it("relative target without ${workspaceFolder} resolves against workspace root", () => {
    const r = new AliasResolver(WORKSPACE, { "@s": "src/styles" });
    // Equivalent to the commented plan behavior — workspace-relative default.
    expect(r.resolve("@s/button")).toBe(path.resolve(WORKSPACE, "src/styles/button"));
  });
});
