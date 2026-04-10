import { afterEach, describe, expect, it } from "vitest";
import { DiagnosticTag } from "vscode-languageserver-protocol/node";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";
import type { FileTask } from "../../server/src/core/indexing/indexer-worker";

const BUTTON_SCSS = `
.indicator { color: red; }
.active { color: blue; }
.unused { opacity: 0.5; }
`;

// A TSX file that references "indicator" and "active" but not "unused".
const APP_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function App() {
  return <div className={cx('indicator', 'active')}>hi</div>;
}
`;

describe("SCSS unused selector diagnostics protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("publishes Unnecessary hint for selectors with zero references after indexing completes", async () => {
    async function* supplier(): AsyncIterable<FileTask> {
      // No tasks -- the didOpen on App.tsx triggers analysisCache
      // which records into the reverse index via onAnalyze.
    }
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
      fileSupplier: () => supplier(),
    });
    await client.initialize();
    client.initialized();

    // Open the TSX file first so the reverse index is populated.
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/App.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: APP_TSX,
      },
    });
    // Consume TSX diagnostics (clean file, no unknown classes).
    await client.waitForDiagnostics("file:///fake/workspace/src/App.tsx");

    // Now open the SCSS file -- expect diagnostics for "unused".
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.module.scss",
        languageId: "scss",
        version: 1,
        text: BUTTON_SCSS,
      },
    });
    const diagnostics = await client.waitForDiagnostics(
      "file:///fake/workspace/src/Button.module.scss",
    );
    // "unused" has zero references.
    const unusedDiag = diagnostics.find((d) => d.message.includes("'.unused'"));
    expect(unusedDiag).toBeDefined();
    expect(unusedDiag!.tags).toContain(DiagnosticTag.Unnecessary);
  });
});
