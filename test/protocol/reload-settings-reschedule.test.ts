import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";
import type { FileTask } from "../../server/src/core/indexing/indexer-worker";

const BUTTON_SCSS = `.btn-primary { color: red; }
.orphan { color: blue; }
`;

// TSX accesses the class via the camelCase alias `styles.btnPrimary`
// only. Under `asIs` the class map has no such key, so the reference
// does not reach the `.btn-primary` bucket and the SCSS unused check
// flags the selector. Flipping to `camelCase` adds the alias entry
// and the canonical routing unifies the two views, clearing the
// flag.
const APP_TSX = `import styles from './Button.module.scss';
export function App() {
  return <div className={styles.btnPrimary}>hi</div>;
}
`;

describe("reloadSettings reschedules open documents by language", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("classnameTransform change reschedules open SCSS docs, not just TSX", async () => {
    function supplier(): AsyncIterable<FileTask> {
      return {
        [Symbol.asyncIterator](): AsyncIterator<FileTask> {
          return {
            next: () => Promise.resolve({ done: true, value: undefined as never }),
          };
        },
      };
    }
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
      fileSupplier: supplier,
    });
    await client.initialize();
    client.initialized();

    const SCSS_URI = "file:///fake/workspace/src/Button.module.scss";
    const TSX_URI = "file:///fake/workspace/src/App.tsx";

    // Open TSX first so the reverse index is populated before the
    // SCSS unused-selector check runs.
    client.didOpen({
      textDocument: { uri: TSX_URI, languageId: "typescriptreact", version: 1, text: APP_TSX },
    });
    await client.waitForDiagnostics(TSX_URI);

    client.didOpen({
      textDocument: { uri: SCSS_URI, languageId: "scss", version: 1, text: BUTTON_SCSS },
    });
    const initialScss = await client.waitForDiagnostics(SCSS_URI);
    // Default mode (`asIs`) does not expose `btnPrimary`, so the
    // TSX access falls under an unrelated bucket and the SCSS
    // selector is flagged unused.
    expect(initialScss.find((d) => d.message.includes("'.btn-primary'"))).toBeDefined();

    // Flip to `camelCase`. The class map now carries both
    // `btn-primary` and its `btnPrimary` alias, so the reverse
    // index resolves the TSX access to the canonical bucket and
    // the selector is no longer unused — but only if the open
    // SCSS document gets rescheduled. Pre-fix, `reloadSettings`
    // routed every open document through `scheduleTsx`, leaving
    // the SCSS diagnostic frozen against the prior mode.
    client.setConfiguration("cssModuleExplainer", {
      scss: { classnameTransform: "camelCase" },
    });
    client.didChangeConfiguration();

    const rescheduledScss = await client.waitForDiagnostics(SCSS_URI);
    // `.orphan` stays unused under both modes — its presence in
    // the rescheduled publish proves the SCSS unused-selector
    // check actually ran (as opposed to the pre-fix behaviour,
    // which routed SCSS docs through `scheduleTsx` and published
    // an empty diagnostic array from the TSX class-token check).
    expect(rescheduledScss.find((d) => d.message.includes("'.orphan'"))).toBeDefined();
    expect(rescheduledScss.find((d) => d.message.includes("'.btn-primary'"))).toBeUndefined();
  });
});
