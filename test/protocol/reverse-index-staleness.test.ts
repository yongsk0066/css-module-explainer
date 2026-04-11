import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType } from "vscode-languageserver-protocol/node";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

// ──────────────────────────────────────────────────────────────
// Wave 1 Stage 3.5 — reverse-index TSX staleness regression
//
// Bug: when a class is ADDED to a .module.scss file, cached TSX
// analysis entries still carry the pre-change classRefs
// expansions. `analysisCache.get(uri, content, filePath, version)`
// keys on the TSX buffer's version — if the user hasn't typed,
// the version has not bumped, and the cache returns the stale
// entry. `onAnalyze` never re-fires, so the reverse index's
// template/variable "expanded" sites stay frozen against the
// previous classMap.
//
// Fix: `onDidChangeWatchedFiles` walks
// `reverseIndex.findAllForScssPath(filePath)` and calls
// `analysisCache.invalidate(uri)` for every TSX URI that had a
// site pointing at the changed SCSS file. The next debounced
// `scheduleTsx` cycle cache-misses, re-analyzes, and
// re-contributes fresh expanded sites.
// ──────────────────────────────────────────────────────────────

const APP_TSX = `import classNames from 'classnames/bind';
import styles from './app.module.scss';
const cx = classNames.bind(styles);
const size = 'small';
export function App() {
  return <div className={cx(\`btn-\${size}\`)}>hi</div>;
}
`;

describe("Wave 1 Stage 3.5 — reverse-index staleness (regression)", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("adding a class to a watched SCSS module invalidates cached TSX reverse-index expansions", async () => {
    // SCSS starts with only `.btn-small`. The template expansion
    // in the TSX should initially produce a single expanded
    // reverse-index entry for `btn-small`.
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
    // populates the reverse index with the template's expansion
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
    // reverse index's existing expansion still only knows about
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
    // to fire. This guarantees `analysisCache.get` has been
    // re-invoked; post-fix it cache-misses (because we invalidated
    // it) and re-runs `onAnalyze`, refreshing expanded sites.
    // Pre-fix the TSX cache still hits its pre-change version,
    // `onAnalyze` is skipped, and the reverse-index entry for
    // `btn-large` is never recorded.
    const second = await client.waitForDiagnostics(tsxUri);
    expect(second).toEqual([]);

    const refsAfter = await client.references({
      textDocument: { uri: scssUri },
      position: { line: 1, character: 3 }, // inside `.btn-large`
      context: { includeDeclaration: false },
    });
    // Post-fix: the template expansion now includes `btn-large`.
    // Pre-fix: `refsAfter` is null (reverse index has no entry
    // for `btn-large` on this SCSS path → `handleReferences`
    // returns null on the empty-sites branch).
    expect(refsAfter).not.toBeNull();
    expect(refsAfter!.length).toBeGreaterThan(0);
    expect(refsAfter!.some((loc) => loc.uri === tsxUri)).toBe(true);
  });
});
