import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server.js";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver.js";

const BUTTON_TSX_V1 = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicaror')}>hi</div>;
}
`;

describe("diagnostics debounce", () => {
  let client: LspTestClient | null = null;
  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("coalesces rapid didChange events into a single diagnostic publish", async () => {
    client = createInProcessServer({
      readStyleFile: () => ".indicator { color: red; }",
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: BUTTON_TSX_V1,
      },
    });

    // Wait for first diagnostic (the typo 'indicaror').
    const first = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(first).toHaveLength(1);

    // Now fire 3 rapid didChange events — only the LAST should
    // produce a diagnostic publish thanks to the 200ms debounce.
    for (let v = 2; v <= 4; v++) {
      client.didChange({
        textDocument: { uri: "file:///fake/workspace/src/Button.tsx", version: v },
        contentChanges: [
          { text: BUTTON_TSX_V1.replace("indicaror", v === 4 ? "indicator" : "indicaror") },
        ],
      });
    }

    // The final version (v4) has 'indicator' → clean → empty diagnostics.
    const last = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(last).toEqual([]);
  });
});
