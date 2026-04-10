import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType } from "vscode-languageserver-protocol/node";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server.js";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver.js";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;

describe("file watcher", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("invalidates the style cache on a Deleted event", async () => {
    let scssContent: string | null = ".indicator { color: red; }";
    let readCount = 0;
    client = createInProcessServer({
      readStyleFile: () => {
        readCount += 1;
        return scssContent;
      },
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: BUTTON_TSX,
      },
    });
    // First pass — clean (indicator exists) and readStyleFile
    // has now been invoked at least once.
    const first = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(first).toEqual([]);
    const readsBeforeDelete = readCount;
    expect(readsBeforeDelete).toBeGreaterThan(0);

    // Simulate file deletion: readStyleFile will return null on
    // the next invocation (indicating the file is gone).
    scssContent = null;
    client.didChangeWatchedFiles({
      changes: [
        {
          uri: "file:///fake/workspace/src/Button.module.scss",
          type: FileChangeType.Deleted,
        },
      ],
    });

    // After Deleted: diagnostics re-run; the cache was
    // invalidated, so readStyleFile is called again. The call
    // returns null → classMap is null → provider skips the
    // call rather than reporting; empty diagnostics is correct
    // (a user-visible "missing file" diagnostic is a Plan
    // Release enhancement, not a Phase 10 contract).
    await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(readCount).toBeGreaterThan(readsBeforeDelete);
  });

  it("re-runs diagnostics on open docs when a watched SCSS file changes", async () => {
    // Track the current "on-disk" SCSS content that the server
    // will read via readStyleFile. The test flips it mid-run.
    let scssContent = ".other { color: red; }"; // no 'indicator'
    client = createInProcessServer({
      readStyleFile: () => scssContent,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: BUTTON_TSX,
      },
    });

    // First pass — expect a warning because 'indicator' is missing.
    const first = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(first).toHaveLength(1);
    expect(first[0]!.message).toContain("'.indicator'");

    // Now "change" the SCSS on disk so 'indicator' becomes valid,
    // then notify the server via the file watcher protocol.
    scssContent = ".indicator { color: blue; }";
    client.didChangeWatchedFiles({
      changes: [
        {
          uri: "file:///fake/workspace/src/Button.module.scss",
          type: FileChangeType.Changed,
        },
      ],
    });

    // Second pass — diagnostic should clear because StyleIndexCache
    // was invalidated and re-read through readStyleFile.
    const second = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(second).toEqual([]);
  });
});
