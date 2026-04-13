import { describe, it, expect } from "vitest";
import ts from "typescript";
import type { Range } from "@css-module-explainer/shared";
import { WorkspaceTypeResolver } from "../../../server/src/core/ts/type-resolver";

/**
 * Build an in-memory ts.CompilerHost backed by a file map.
 *
 * IMPORTANT: every test using this helper MUST set `noLib: true`
 * in its CompilerOptions. The host intentionally does NOT serve
 * `lib.d.ts`; if a test forgets noLib, the checker silently falls
 * back to `any` for built-in types and skews extractStringLiterals
 * results.
 */
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

function makeResolver(files: Record<string, string>, onCreate?: () => void): WorkspaceTypeResolver {
  const rootNames = Object.keys(files);
  const host = makeHost(files);
  return new WorkspaceTypeResolver({
    createProgram: () => {
      onCreate?.();
      return ts.createProgram({
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
      });
    },
  });
}

function rangeOfOccurrence(filePath: string, text: string, needle: string, occurrence = 1): Range {
  let fromIndex = 0;
  let offset = -1;
  for (let current = 0; current < occurrence; current += 1) {
    offset = text.indexOf(needle, fromIndex);
    if (offset < 0) {
      throw new Error(`Could not find occurrence ${occurrence} of ${needle} in ${filePath}`);
    }
    fromIndex = offset + needle.length;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const start = sourceFile.getLineAndCharacterOfPosition(offset);
  const end = sourceFile.getLineAndCharacterOfPosition(offset + needle.length);
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
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

  it("resolves a generic parameter via its base constraint", () => {
    // Exercises the `getBaseConstraintOfType` recursion branch in
    // extractStringLiterals. Without this test, lines 155-158 of
    // type-resolver.ts have zero coverage.
    const resolver = makeResolver({
      "/ws/a.tsx": `
        function pick<T extends "small" | "medium" | "large">(value: T): T {
          return value;
        }
        function App() {
          const size = pick("small" as const);
          return size;
        }
        export {};
      `,
    });
    const result = resolver.resolve("/ws/a.tsx", "value", "/ws");
    // `value: T extends "small" | "medium" | "large"` — resolver
    // recurses on the base constraint and returns the union.
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["large", "medium", "small"]);
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

  it("resolves a dotted property chain on a local const object", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `const sizes = { large: "lg", small: "sm" } as const; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "sizes.large", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a named import + property chain", () => {
    const resolver = makeResolver({
      "/ws/theme.ts": `export const sizes = { large: "lg", small: "sm" } as const;`,
      "/ws/a.tsx": `import { sizes } from "./theme"; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "sizes.large", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a default import + property chain", () => {
    const resolver = makeResolver({
      "/ws/theme.ts": `const sizes = { large: "lg" } as const; export default sizes;`,
      "/ws/a.tsx": `import sizes from "./theme"; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "sizes.large", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a namespace import + deep property chain", () => {
    const resolver = makeResolver({
      "/ws/theme.ts": `export const sizes = { large: "lg" } as const;`,
      "/ws/a.tsx": `import * as theme from "./theme"; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "theme.sizes.large", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a renamed import binding", () => {
    const resolver = makeResolver({
      "/ws/theme.ts": `export const size = "lg" as const;`,
      "/ws/a.tsx": `import { size as s } from "./theme"; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "s", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("returns unresolvable for a dotted path where the root exists but property does not", () => {
    const resolver = makeResolver({
      "/ws/a.tsx": `const sizes = { large: "lg" } as const; export {};`,
    });
    const result = resolver.resolve("/ws/a.tsx", "sizes.nonexistent", "/ws");
    expect(result.kind).toBe("unresolvable");
  });

  it("prefers a local declaration over an import with the same name", () => {
    // Regression: import-first DFS used to pick the import binding,
    // shadowing the local parameter. The 2-pass (local-first,
    // import-fallback) strategy must pick the local parameter.
    const resolver = makeResolver({
      "/ws/theme.ts": `export const sizes = { large: "imported" } as const;`,
      "/ws/a.tsx": `
        import { sizes } from "./theme";
        function render(sizes: "local-a" | "local-b") { return sizes; }
        export {};
      `,
    });
    const result = resolver.resolve("/ws/a.tsx", "sizes", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["local-a", "local-b"]);
  });

  it("uses the call-site range to resolve the innermost shadowed local", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `
      function render(flag: boolean) {
        const size = "outer" as const;
        if (flag) {
          const size = "inner" as const;
          return size;
        }
        return size;
      }
      export {};
    `;
    const resolver = makeResolver({
      [filePath]: fileText,
    });

    const innerResult = resolver.resolve(
      filePath,
      "size",
      "/ws",
      rangeOfOccurrence(filePath, fileText, "size", 3),
    );
    expect(innerResult.kind).toBe("union");
    expect(innerResult.values).toEqual(["inner"]);

    const outerResult = resolver.resolve(
      filePath,
      "size",
      "/ws",
      rangeOfOccurrence(filePath, fileText, "size", 4),
    );
    expect(outerResult.kind).toBe("union");
    expect(outerResult.values).toEqual(["outer"]);
  });

  it("falls back to import when no local declaration matches", () => {
    // Ensures the import-fallback pass still works when no local
    // declaration shadows the import binding.
    const resolver = makeResolver({
      "/ws/theme.ts": `export const size = "imported" as const;`,
      "/ws/a.tsx": `
        import { size } from "./theme";
        const unrelated = 42;
        export {};
      `,
    });
    const result = resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["imported"]);
  });
});

describe("WorkspaceTypeResolver / program caching", () => {
  it("builds the ts.Program only once per workspaceRoot", () => {
    let calls = 0;
    const resolver = makeResolver({ "/ws/a.tsx": `const size = "s" as const; export {};` }, () => {
      calls += 1;
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(1);
  });

  it("invalidate(workspaceRoot) forces the next resolve to rebuild", () => {
    let calls = 0;
    const resolver = makeResolver({ "/ws/a.tsx": `const size = "s" as const; export {};` }, () => {
      calls += 1;
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.invalidate("/ws");
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(2);
  });

  it("clear() drops every cached program", () => {
    let calls = 0;
    const resolver = makeResolver({ "/ws/a.tsx": `const size = "s" as const; export {};` }, () => {
      calls += 1;
    });
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    resolver.clear();
    resolver.resolve("/ws/a.tsx", "size", "/ws");
    expect(calls).toBe(2);
  });
});
