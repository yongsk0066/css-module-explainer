import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType } from "vscode-languageserver-protocol/node";
import type { ResolvedType } from "@css-module-explainer/shared";
import type { TypeResolver } from "../../server/src/core/ts/type-resolver.js";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server.js";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;

class FakeTypeResolver implements TypeResolver {
  resolve(): ResolvedType {
    return { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

describe("file watcher", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
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
