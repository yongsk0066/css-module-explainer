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
}

.active {
  color: blue;
}
`;

function openButton(client: LspTestClient): void {
  client.didOpen({
    textDocument: {
      uri: "file:///fake/workspace/src/Button.tsx",
      languageId: "typescriptreact",
      version: 1,
      text: BUTTON_TSX,
    },
  });
}

describe("definition protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns a LocationLink for cx('indicator')", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? BUTTON_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    // Line 4 (0-based): "  return <div className={cx('indicator')}>hi</div>;"
    //                                               ↑ column 32 is inside 'indicator'
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string; originSelectionRange: unknown }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Button\.module\.scss$/);
    expect(links[0]!.targetUri.startsWith("file://")).toBe(true);
    expect(links[0]!.originSelectionRange).toBeDefined();
  });

  it("returns null when the cursor is outside any cx call", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    // Line 0 = the import statement. No cx call can span it.
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 0, character: 5 },
    });
    expect(result).toBeNull();
  });

  it("returns null for an unknown class name", async () => {
    client = createInProcessServer({
      readStyleFile: () => ".other { color: red; }",
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(result).toBeNull();
  });

  it("returns null for a file that does not import classnames/bind", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Plain.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: "const x = 1;\n",
      },
    });
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Plain.tsx" },
      position: { line: 0, character: 5 },
    });
    expect(result).toBeNull();
  });

  it("returns multiple LocationLinks for a union-typed cx(variable) call", async () => {
    const SIZED_TSX = `import classNames from 'classnames/bind';
import styles from './Sized.module.scss';
const cx = classNames.bind(styles);
export function Sized({ size }: { size: 'small' | 'medium' }) {
  return <div className={cx(size)}>hi</div>;
}
`;
    const SIZED_SCSS = `
.small { font-size: 12px; }
.medium { font-size: 16px; }
.large { font-size: 20px; }
`;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Sized.module.scss") ? SIZED_SCSS : null),
      typeResolver: new FakeTypeResolver(["small", "medium"]),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Sized.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: SIZED_TSX,
      },
    });
    // Line 4 (0-based): "  return <div className={cx(size)}>hi</div>;"
    //                                               ↑ column 30 is inside `size`
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Sized.tsx" },
      position: { line: 4, character: 30 },
    });
    expect(result).not.toBeNull();
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(2);
  });
});
