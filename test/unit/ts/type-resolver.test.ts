import { describe, it, expect } from "vitest";
import ts from "typescript";
import type { Range } from "@css-module-explainer/shared";
import {
  buildSourceBinder,
  resolveIdentifierAtOffset,
} from "../../../server/engine-core-ts/src/core/binder/binder-builder";
import { WorkspaceTypeResolver } from "../../../server/engine-core-ts/src/core/ts/type-resolver";

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

function rangeOfIdentifierOccurrence(
  filePath: string,
  text: string,
  identifier: string,
  occurrence = 1,
): Range {
  const matches = Array.from(text.matchAll(new RegExp(`\\b${identifier}\\b`, "g")));
  const match = matches[occurrence - 1];
  if (!match || match.index === undefined) {
    throw new Error(
      `Could not find identifier occurrence ${occurrence} of ${identifier} in ${filePath}`,
    );
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const start = sourceFile.getLineAndCharacterOfPosition(match.index);
  const end = sourceFile.getLineAndCharacterOfPosition(match.index + identifier.length);
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}

function resolveAt(
  resolver: WorkspaceTypeResolver,
  filePath: string,
  text: string,
  variableName: string,
  anchor = variableName,
  occurrence = 1,
  workspaceRoot = "/ws",
) {
  const range = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(anchor)
    ? rangeOfIdentifierOccurrence(filePath, text, anchor, occurrence)
    : rangeOfOccurrence(filePath, text, anchor, occurrence);
  return resolver.resolve(filePath, variableName, workspaceRoot, range);
}

describe("WorkspaceTypeResolver.resolve", () => {
  it("resolves a const-declared string literal to a single-member union", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `const size = "small" as const; export {};`;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "size");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["small"]);
  });

  it("resolves a parameter typed as a string-literal union", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `
        type Size = "small" | "medium" | "large";
        function Button({ size }: { size: Size }) { return size; }
        export {};
      `;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "size", "size", 2);
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["large", "medium", "small"]);
  });

  it("resolves a destructured prop typed via an alias", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `
        interface Props { variant: "primary" | "secondary" }
        function Button({ variant }: Props) { return variant; }
        export {};
      `;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "variant", "variant", 2);
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["primary", "secondary"]);
  });

  it("resolves a generic parameter via its base constraint", () => {
    // Exercises the `getBaseConstraintOfType` recursion branch in
    // extractStringLiterals. Without this test, lines 155-158 of
    // type-resolver.ts have zero coverage.
    const filePath = "/ws/a.tsx";
    const fileText = `
        function pick<T extends "small" | "medium" | "large">(value: T): T {
          return value;
        }
        function App() {
          const size = pick("small" as const);
          return size;
        }
        export {};
      `;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "value", "value", 2);
    // `value: T extends "small" | "medium" | "large"` — resolver
    // recurses on the base constraint and returns the union.
    expect(result.kind).toBe("union");
    expect(result.values.toSorted()).toEqual(["large", "medium", "small"]);
  });

  it("returns unresolvable when the identifier cannot be found", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `const a = 1; export {};`;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "nowhere", "a");
    expect(result.kind).toBe("unresolvable");
    expect(result.values).toEqual([]);
  });

  it("returns unresolvable for a non-string type (number)", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `const count: number = 5; export {};`;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "count");
    expect(result.kind).toBe("unresolvable");
  });

  it("returns unresolvable for `string` without literal narrowing", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `const name: string = "x"; export {};`;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "name");
    expect(result.kind).toBe("unresolvable");
  });

  it("resolves through a provided binder and root decl id", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `
      const size = "outer" as const;
      function render() {
        const size = "inner" as const;
        return size;
      }
      export {};
    `;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const sourceFile = ts.createSourceFile(
      filePath,
      fileText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const binder = buildSourceBinder(sourceFile);
    const offset = fileText.lastIndexOf("size;");
    const resolution = resolveIdentifierAtOffset(binder, "size", offset);

    const result = resolver.resolve(
      filePath,
      "size",
      "/ws",
      rangeOfIdentifierOccurrence(filePath, fileText, "size", 3),
      {
        sourceBinder: binder,
        rootBindingDeclId: resolution?.declId,
      },
    );

    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["inner"]);
  });

  it("returns unresolvable when the source file is not part of the program", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `const size = "s" as const; export {};`;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, "/ws/nowhere.tsx", fileText, "size");
    expect(result.kind).toBe("unresolvable");
  });

  it("resolves a dotted property chain on a local const object", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `const sizes = { large: "lg", small: "sm" } as const; export {};`;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "sizes.large", "sizes");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a named import + property chain", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `import { sizes } from "./theme"; export {};`;
    const resolver = makeResolver({
      "/ws/theme.ts": `export const sizes = { large: "lg", small: "sm" } as const;`,
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "sizes.large", "sizes");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a default import + property chain", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `import sizes from "./theme"; export {};`;
    const resolver = makeResolver({
      "/ws/theme.ts": `const sizes = { large: "lg" } as const; export default sizes;`,
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "sizes.large", "sizes");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a namespace import + deep property chain", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `import * as theme from "./theme"; export {};`;
    const resolver = makeResolver({
      "/ws/theme.ts": `export const sizes = { large: "lg" } as const;`,
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "theme.sizes.large", "theme");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("resolves a renamed import binding", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `import { size as s } from "./theme"; export {};`;
    const resolver = makeResolver({
      "/ws/theme.ts": `export const size = "lg" as const;`,
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "s");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["lg"]);
  });

  it("returns unresolvable for a dotted path where the root exists but property does not", () => {
    const filePath = "/ws/a.tsx";
    const fileText = `const sizes = { large: "lg" } as const; export {};`;
    const resolver = makeResolver({
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "sizes.nonexistent", "sizes");
    expect(result.kind).toBe("unresolvable");
  });

  it("prefers a local declaration over an import with the same name", () => {
    // Regression: import-first DFS used to pick the import binding,
    // shadowing the local parameter. The 2-pass (local-first,
    // import-fallback) strategy must pick the local parameter.
    const filePath = "/ws/a.tsx";
    const fileText = `
        import { sizes } from "./theme";
        function render(sizes: "local-a" | "local-b") { return sizes; }
        export {};
      `;
    const resolver = makeResolver({
      "/ws/theme.ts": `export const sizes = { large: "imported" } as const;`,
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "sizes", "sizes", 3);
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
    const filePath = "/ws/a.tsx";
    const fileText = `
        import { size } from "./theme";
        const unrelated = 42;
        export {};
      `;
    const resolver = makeResolver({
      "/ws/theme.ts": `export const size = "imported" as const;`,
      [filePath]: fileText,
    });
    const result = resolveAt(resolver, filePath, fileText, "size");
    expect(result.kind).toBe("union");
    expect(result.values).toEqual(["imported"]);
  });
});

describe("WorkspaceTypeResolver / program caching", () => {
  it("builds the ts.Program only once per workspaceRoot", () => {
    let calls = 0;
    const filePath = "/ws/a.tsx";
    const fileText = `const size = "s" as const; export {};`;
    const resolver = makeResolver({ [filePath]: fileText }, () => {
      calls += 1;
    });
    resolveAt(resolver, filePath, fileText, "size");
    resolveAt(resolver, filePath, fileText, "size");
    expect(calls).toBe(1);
  });

  it("invalidate(workspaceRoot) forces the next resolve to rebuild", () => {
    let calls = 0;
    const filePath = "/ws/a.tsx";
    const fileText = `const size = "s" as const; export {};`;
    const resolver = makeResolver({ [filePath]: fileText }, () => {
      calls += 1;
    });
    resolveAt(resolver, filePath, fileText, "size");
    resolver.invalidate("/ws");
    resolveAt(resolver, filePath, fileText, "size");
    expect(calls).toBe(2);
  });

  it("clear() drops every cached program", () => {
    let calls = 0;
    const filePath = "/ws/a.tsx";
    const fileText = `const size = "s" as const; export {};`;
    const resolver = makeResolver({ [filePath]: fileText }, () => {
      calls += 1;
    });
    resolveAt(resolver, filePath, fileText, "size");
    resolver.clear();
    resolveAt(resolver, filePath, fileText, "size");
    expect(calls).toBe(2);
  });
});
