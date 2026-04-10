import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;

const BUTTON_SCSS = `
.indicator {
  color: red;
  font-size: 14px;
}
`;

describe("hover protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns a markdown Hover for cx('indicator')", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? BUTTON_SCSS : null),
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
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("`.indicator`");
    expect(value).toContain("color: red;");
    expect(value).toContain("font-size: 14px;");
  });

  it("returns null on unknown class", async () => {
    client = createInProcessServer({
      readStyleFile: () => ".other { color: red; }",
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
    const hover = await client.hover({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(hover).toBeNull();
  });
});
