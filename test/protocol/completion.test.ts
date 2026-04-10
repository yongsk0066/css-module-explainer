import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('
}
`;

const BUTTON_SCSS = `
.indicator { color: red; }
.active { color: blue; }
.disabled { color: gray; }
`;

describe("completion protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns the SCSS class list inside an open cx('", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
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
    // Cursor just after cx(' on line 4
    const result = await client.completion({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 29 },
    });
    expect(result).not.toBeNull();
    const items = Array.isArray(result) ? result : result!.items;
    expect(items.length).toBe(3);
    const labels = items.map((i) => i.label).toSorted();
    expect(labels).toEqual(["active", "disabled", "indicator"]);
  });

  it("returns null when outside any cx call", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
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
    const result = await client.completion({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 0, character: 5 },
    });
    expect(result).toBeNull();
  });
});
