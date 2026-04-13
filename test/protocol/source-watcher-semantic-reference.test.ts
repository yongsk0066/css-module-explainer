import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType } from "vscode-languageserver-protocol/node";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import type { Range, ResolvedType } from "@css-module-explainer/shared";
import type { TypeResolver } from "../../server/src/core/ts/type-resolver";

// Source-file watcher → semantic reference freshness.
//
// When a TS/JS source file is saved on disk, the server receives a
// `didChangeWatchedFiles` notification. The handler must:
//   1. Invalidate the workspace TypeResolver program.
//   2. Invalidate the analysis cache for every open source document
//      so `onAnalyze` re-fires and semantic reference expansions rebuild
//      with fresh type data.
//
// Without step 2, `analysisCache.get()` returns the cached entry
// (the TSX buffer version hasn't changed), `onAnalyze` never
// re-fires, and semantic reference expansions stay frozen against
// the previous type-resolver output.

/**
 * FakeTypeResolver whose return value can be swapped mid-test.
 * `values` is public so the test can mutate it between watcher
 * events.
 */
class MutableFakeTypeResolver implements TypeResolver {
  values: readonly string[];

  constructor(values: readonly string[] = []) {
    this.values = values;
  }

  resolve(
    _filePath?: string,
    _variableName?: string,
    _workspaceRoot?: string,
    _range?: Range,
  ): ResolvedType {
    return this.values.length > 0
      ? { kind: "union", values: [...this.values] }
      : { kind: "unresolvable", values: [] };
  }

  invalidate(): void {}
  clear(): void {}
}

// Uses a bare variable `cx(size)` (not a template `cx(\`btn-${size}\`)`)
// so the semantic expansion goes through `expandVariableRef` →
// `typeResolver.resolve`, not `expandTemplateRef` (prefix match).
const APP_TSX = `import classNames from 'classnames/bind';
import styles from './app.module.scss';
const cx = classNames.bind(styles);
const size = 'small';
export function App() {
  return <div className={cx(size)}>hi</div>;
}
`;

describe("source-watcher → semantic reference freshness", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("source file save invalidates analysis cache and refreshes semantic reference expansions", async () => {
    // TypeResolver initially resolves `size` to "small", so
    // `expandVariableRef` records a semantic reference for `small`.
    const typeResolver = new MutableFakeTypeResolver(["small"]);
    const scssContent = ".small { color: red; }\n.large { color: blue; }\n";

    client = createInProcessServer({
      readStyleFile: () => scssContent,
      typeResolver,
    });
    await client.initialize();
    client.initialized();

    const tsxUri = "file:///fake/workspace/src/App.tsx";
    const scssUri = "file:///fake/workspace/src/app.module.scss";

    client.didOpen({
      textDocument: {
        uri: tsxUri,
        languageId: "typescriptreact",
        version: 1,
        text: APP_TSX,
      },
    });

    // Initial diagnostics — triggers onAnalyze, populates
    // semantic references with the `small` expansion via expandVariableRef.
    await client.waitForDiagnostics(tsxUri);

    // Sanity: Find References on `.small` returns the TSX site.
    const refsSmall = await client.references({
      textDocument: { uri: scssUri },
      position: { line: 0, character: 2 }, // inside `.small`
      context: { includeDeclaration: false },
    });
    expect(refsSmall).not.toBeNull();
    expect(refsSmall!.some((loc) => loc.uri === tsxUri)).toBe(true);

    // `.large` should NOT have a reference yet — typeResolver
    // only returned ["small"].
    const refsLargeBefore = await client.references({
      textDocument: { uri: scssUri },
      position: { line: 1, character: 2 }, // inside `.large`
      context: { includeDeclaration: false },
    });
    const hadLargeBefore =
      refsLargeBefore !== null && refsLargeBefore.some((loc) => loc.uri === tsxUri);
    expect(hadLargeBefore).toBe(false);

    // Simulate source change: `size` now resolves to "large".
    typeResolver.values = ["large"];

    // Fire a source-file watcher event (e.g. the file defining
    // `size` was edited and saved).
    client.didChangeWatchedFiles({
      changes: [
        {
          uri: "file:///fake/workspace/src/theme.ts",
          type: FileChangeType.Changed,
        },
      ],
    });

    // Wait for the debounced re-diagnostics — the analysis cache
    // must have been invalidated so `onAnalyze` re-fires with the
    // new type-resolver output.
    await client.waitForDiagnostics(tsxUri);

    // `.large` should now have a reference from the variable
    // expansion.
    const refsLargeAfter = await client.references({
      textDocument: { uri: scssUri },
      position: { line: 1, character: 2 }, // inside `.large`
      context: { includeDeclaration: false },
    });
    expect(refsLargeAfter).not.toBeNull();
    expect(refsLargeAfter!.length).toBeGreaterThan(0);
    expect(refsLargeAfter!.some((loc) => loc.uri === tsxUri)).toBe(true);
  });
});
