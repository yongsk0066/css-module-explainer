import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType } from "vscode-languageserver-protocol/node";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

// Semantic reference TSX staleness on watched-file change.
//
// When a class is added to a `.module.scss` file, cached TSX
// analysis entries still carry the pre-change classRefs
// expansions. `analysisCache.get(uri, content, filePath, version)`
// keys on the TSX buffer's version — if the user hasn't typed,
// the version has not bumped, and the cache returns the stale
// entry. `onAnalyze` never re-fires, so the semantic reference
// sites stay frozen against the
// previous classMap.
//
// `onDidChangeWatchedFiles` walks
// `semanticReferenceIndex.findReferencingUris(filePath)` and calls
// `analysisCache.invalidate(uri)` for every TSX URI that had a
// site pointing at the changed SCSS file. The next debounced
// `scheduleTsx` cycle cache-misses, re-analyzes, and
// re-contributes fresh semantic sites.

const APP_TSX = `import classNames from 'classnames/bind';
import styles from './app.module.scss';
const cx = classNames.bind(styles);
const size = 'small';
export function App() {
  return <div className={cx(\`btn-\${size}\`)}>hi</div>;
}
`;

describe("semantic reference staleness on watched SCSS change", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("adding a class to a watched SCSS module invalidates cached semantic reference expansions", async () => {
    // SCSS starts with only `.btn-small`. The template expansion
    // in the TSX should initially produce a single expanded
    // semantic reference for `btn-small`.
    let scssContent = ".btn-small { color: red; }\n";
    client = createInProcessServer({
      readStyleFile: () => scssContent,
      typeResolver: new FakeTypeResolver(),
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

    // First diagnostics push — forces the initial analyze, which
    // populates semantic references with the template's expansion
    // against the current classMap (`.btn-small` only).
    const first = await client.waitForDiagnostics(tsxUri);
    expect(first).toEqual([]);

    // Sanity check: the template expansion recorded `btn-small`.
    // Find References on the existing `.btn-small` selector in
    // the SCSS file must return the template call site.
    const initialRefs = await client.references({
      textDocument: { uri: scssUri },
      position: { line: 0, character: 3 }, // inside `.btn-small`
      context: { includeDeclaration: false },
    });
    expect(initialRefs).not.toBeNull();
    expect(initialRefs!.length).toBeGreaterThan(0);
    expect(initialRefs!.some((loc) => loc.uri === tsxUri)).toBe(true);

    // Now "change" the SCSS on disk: add `.btn-large {}`. The
    // current semantic expansion still only knows about
    // `btn-small` because it was computed from the previous
    // classMap. Find References on `.btn-large` MUST return the
    // template call site after the watched-file event debounces
    // through — which requires the TSX analysis cache to be
    // invalidated so `onAnalyze` re-fires against the new
    // classMap.
    scssContent = ".btn-small { color: red; }\n.btn-large { color: blue; }\n";
    client.didChangeWatchedFiles({
      changes: [
        {
          uri: scssUri,
          type: FileChangeType.Changed,
        },
      ],
    });

    // Wait for the debounced diagnostics pipeline on the TSX file
    // to fire. `didChangeWatchedFiles` must have invalidated the
    // TSX analysis entry so this compute cache-misses and re-runs
    // `onAnalyze`, refreshing the expanded semantic sites.
    // If the invalidation is skipped the TSX cache hits its
    // pre-change version, `onAnalyze` never re-fires, and the
    // semantic reference for `btn-large` is never recorded —
    // `handleReferences` then returns `null` on the empty bucket
    // and the assertion below fails.
    const second = await client.waitForDiagnostics(tsxUri);
    expect(second).toEqual([]);

    const refsAfter = await client.references({
      textDocument: { uri: scssUri },
      position: { line: 1, character: 3 }, // inside `.btn-large`
      context: { includeDeclaration: false },
    });
    // The template expansion must now include `btn-large`.
    expect(refsAfter).not.toBeNull();
    expect(refsAfter!.length).toBeGreaterThan(0);
    expect(refsAfter!.some((loc) => loc.uri === tsxUri)).toBe(true);
  });
});
