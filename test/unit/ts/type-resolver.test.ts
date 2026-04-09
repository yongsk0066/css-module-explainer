import { describe, it, expect } from "vitest";
import ts from "typescript";
import { WorkspaceTypeResolver } from "../../../server/src/core/ts/type-resolver.js";

/**
 * Build a WorkspaceTypeResolver backed by an in-memory CompilerHost.
 * The resolver treats `workspaceRoot` as an opaque key; tests hand
 * it a synthetic root and inject a pre-built program so the
 * resolver never touches disk.
 */
function makeResolver(files: Record<string, string>): WorkspaceTypeResolver {
  const rootNames = Object.keys(files);
  const host: ts.CompilerHost = {
    fileExists: (p) => p in files,
    readFile: (p) => files[p],
    getSourceFile: (fileName, languageVersion) => {
      const text = files[fileName];
      if (text === undefined) return undefined;
      return ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TSX);
    },
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/ws",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    directoryExists: () => true,
    getDirectories: () => [],
  };
  return new WorkspaceTypeResolver({
    createProgram: () =>
      ts.createProgram({
        rootNames,
        options: {
          target: ts.ScriptTarget.Latest,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          strict: true,
          noLib: true,
          skipLibCheck: true,
        },
        host,
      }),
  });
}

describe("WorkspaceTypeResolver.resolve", () => {
  it("resolves a const-declared string literal to a single-member union", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `const size = "small" as const; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["small"]);
  });

  it("resolves a parameter typed as a string-literal union", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `
        type Size = "small" | "medium" | "large";
        function Button({ size }: { size: Size }) { return size; }
        export {};
      `,
    });
    const result = resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["large", "medium", "small"]);
  });

  it("resolves a destructured prop typed via an alias", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `
        interface Props { variant: "primary" | "secondary" }
        function Button({ variant }: Props) { return variant; }
        export {};
      `,
    });
    const result = resolver.resolve("/ws/a.tsx", "variant", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["primary", "secondary"]);
  });

  it("returns unresolvable when the identifier cannot be found", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `const a = 1; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "nowhere", "/ws");
    expect(result.kind).toBe("unresolvable");
    expect(result.values).toEqual([]);
  });

  it("returns unresolvable for a non-string type (number)", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `const count: number = 5; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "count", "/ws");
    expect(result.kind).toBe("unresolvable");
  });

  it("returns unresolvable for `string` without literal narrowing", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `const name: string = "x"; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "name", "/ws");
    expect(result.kind).toBe("unresolvable");
  });

  it("returns unresolvable when the source file is not part of the program", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `const size = "s" as const; export {};`,
    });
    const result = resolver.resolve("/ws/nowhere.tsx", "size", "/ws");
    expect(result.kind).toBe("unresolvable");
  });
});

describe("WorkspaceTypeResolver / program caching", () => {
  function makeHost(files: Record<string, string>): ts.CompilerHost {
    return {
      fileExists: (p) => p in files,
      readFile: (p) => files[p],
      getSourceFile: (fileName, languageVersion) => {
        const text = files[fileName];
        if (text === undefined) return undefined;
        return ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TSX);
      },
      getDefaultLibFileName: () => "lib.d.ts",
      writeFile: () => {},
      getCurrentDirectory: () => "/ws",
      getCanonicalFileName: (f) => f,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      directoryExists: () => true,
      getDirectories: () => [],
    };
  }

  it("builds the ts.Program only once per workspaceRoot", () => {
    const files = { "/ws/a.tsx": `const size = "s" as const; export {};` };
    const host = makeHost(files);
    let calls = 0;
    const resolver = new WorkspaceTypeResolver({
      createProgram: () => {
        calls += 1;
        return ts.createProgram({
          rootNames: Object.keys(files),
          options: { noLib: true, skipLibCheck: true },
          host,
        });
      },
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(1);
  });

  it("invalidate(workspaceRoot) forces the next resolve to rebuild", () => {
    const files = { "/ws/a.tsx": `const size = "s" as const; export {};` };
    const host = makeHost(files);
    let calls = 0;
    const resolver = new WorkspaceTypeResolver({
      createProgram: () => {
        calls += 1;
        return ts.createProgram({
          rootNames: Object.keys(files),
          options: { noLib: true, skipLibCheck: true },
          host,
        });
      },
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.invalidate("/ws");
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(2);
  });

  it("clear() drops every cached program", () => {
    const files = { "/ws/a.tsx": `const size = "s" as const; export {};` };
    const host = makeHost(files);
    let calls = 0;
    const resolver = new WorkspaceTypeResolver({
      createProgram: () => {
        calls += 1;
        return ts.createProgram({
          rootNames: Object.keys(files),
          options: { noLib: true, skipLibCheck: true },
          host,
        });
      },
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.clear();
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(2);
  });
});
