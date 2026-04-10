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

describe("completion protocol / clsx", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  const CLSX_TSX = `import clsx from 'clsx';
import styles from './Button.module.scss';
export function Button() {
  return <div className={clsx(styles.
}
`;

  const CLSX_SCSS = `
.indicator { color: red; }
.active { color: blue; }
.disabled { color: gray; }
`;

  it("returns the SCSS class list inside clsx(styles.|)", async () => {
    client = createInProcessServer({
      readStyleFile: () => CLSX_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: CLSX_TSX,
      },
    });
    // Cursor after "styles." on line 3 (dot is at 36, cursor after dot is 37)
    const result = await client.completion({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 3, character: 37 },
    });
    expect(result).not.toBeNull();
    const items = Array.isArray(result) ? result : result!.items;
    expect(items.length).toBe(3);
    const labels = items.map((i) => i.label).toSorted();
    expect(labels).toEqual(["active", "disabled", "indicator"]);
  });

  it("returns null when outside clsx() call", async () => {
    const OUTSIDE_TSX = `import clsx from 'clsx';
import styles from './Button.module.scss';
const x = styles.
`;
    client = createInProcessServer({
      readStyleFile: () => CLSX_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: OUTSIDE_TSX,
      },
    });
    const result = await client.completion({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 2, character: 18 },
    });
    expect(result).toBeNull();
  });
});

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
