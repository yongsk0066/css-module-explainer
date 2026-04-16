import ts from "typescript";
import { describe, expect, it } from "vitest";
import { AliasResolver } from "../../../server/engine-core-ts/src/core/cx/alias-resolver";
import { collectSourceDependencyPaths } from "../../../server/engine-core-ts/src/core/ts/source-dependencies";

function parse(filePath: string, text: string): ts.SourceFile {
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

describe("collectSourceDependencyPaths", () => {
  it("collects self path and relative import candidates", () => {
    const sourceFile = parse(
      "/fake/ws/src/App.tsx",
      [
        "import { size } from './theme';",
        "export * from './tokens';",
        "import styles from './App.module.scss';",
      ].join("\n"),
    );

    expect(collectSourceDependencyPaths(sourceFile, sourceFile.fileName)).toEqual(
      expect.arrayContaining([
        "/fake/ws/src/App.tsx",
        "/fake/ws/src/theme.ts",
        "/fake/ws/src/theme.tsx",
        "/fake/ws/src/theme/index.ts",
        "/fake/ws/src/tokens.ts",
        "/fake/ws/src/tokens/index.ts",
      ]),
    );
  });

  it("keeps explicit source extensions and ignores non-source extensions", () => {
    const sourceFile = parse(
      "/fake/ws/src/App.tsx",
      [
        "import theme from './theme.ts';",
        "import data from './data.json';",
        "import styles from './App.module.scss';",
      ].join("\n"),
    );

    expect(collectSourceDependencyPaths(sourceFile, sourceFile.fileName)).toEqual([
      "/fake/ws/src/App.tsx",
      "/fake/ws/src/theme.ts",
    ]);
  });

  it("collects aliased source candidates through the shared alias resolver", () => {
    const sourceFile = parse(
      "/fake/ws/src/App.tsx",
      ["import { size } from '@/theme';", "import styles from '@/Button.module.scss';"].join("\n"),
    );
    const aliasResolver = new AliasResolver(
      "/fake/ws",
      {},
      {
        basePath: "/fake/ws/src",
        paths: {
          "@/*": ["*"],
        },
      },
    );

    expect(collectSourceDependencyPaths(sourceFile, sourceFile.fileName, aliasResolver)).toEqual(
      expect.arrayContaining([
        "/fake/ws/src/App.tsx",
        "/fake/ws/src/theme.ts",
        "/fake/ws/src/theme/index.ts",
      ]),
    );
  });
});
