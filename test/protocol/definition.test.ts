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

describe("definition protocol / clsx", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  const CLSX_TSX = `import clsx from 'clsx';
import styles from './Button.module.scss';
export function Button() {
  return <div className={clsx(styles.indicator)}>hi</div>;
}
`;

  const CLSX_SCSS = `
.indicator {
  color: red;
}
`;

  it("returns a LocationLink for styles.indicator inside clsx()", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? CLSX_SCSS : null),
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
    // Line 3: "  return <div className={clsx(styles.indicator)}>hi</div>;"
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 3, character: 42 },
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string; originSelectionRange: unknown }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Button\.module\.scss$/);
  });
});

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

  it("navigates from a cross-file composes token to the target selector", async () => {
    const COMPOSING_SCSS = `
.button {
  composes: base from './Base.module.scss';
  color: red;
}
`;
    const BASE_SCSS = `
.base {
  color: blue;
}
`;
    client = createInProcessServer({
      readStyleFile: (path) => {
        if (path.endsWith("Button.module.scss")) return COMPOSING_SCSS;
        if (path.endsWith("Base.module.scss")) return BASE_SCSS;
        return null;
      },
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.module.scss",
        languageId: "scss",
        version: 1,
        text: COMPOSING_SCSS,
      },
    });
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Base.module.scss",
        languageId: "scss",
        version: 1,
        text: BASE_SCSS,
      },
    });

    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
      position: { line: 2, character: 13 },
    });
    expect(result).not.toBeNull();
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Base\.module\.scss$/);
  });

  it("navigates from a same-file composes token to the canonical selector", async () => {
    const SAME_FILE_SCSS = `
.base {
  color: blue;
}

.button {
  composes: base;
  color: red;
}
`;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? SAME_FILE_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Button.module.scss",
        languageId: "scss",
        version: 1,
        text: SAME_FILE_SCSS,
      },
    });

    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
      position: { line: 6, character: 13 },
    });
    expect(result).not.toBeNull();
    const links = result as Array<{
      targetUri: string;
      targetSelectionRange: { start: { line: number } };
    }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUri).toMatch(/Button\.module\.scss$/);
    expect(links[0]!.targetSelectionRange.start.line).toBe(1);
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

  it("returns multiple LocationLinks for a locally reassigned cx(variable) call", async () => {
    const SIZED_TSX = `import classNames from 'classnames/bind';
import styles from './Sized.module.scss';
const cx = classNames.bind(styles);
export function Sized(flag: boolean) {
  let size = 'sm';
  if (flag) {
    size = 'lg';
  }
  return <div className={cx(size)}>hi</div>;
}
`;
    const SIZED_SCSS = `
.sm { font-size: 12px; }
.lg { font-size: 20px; }
`;
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Sized.module.scss") ? SIZED_SCSS : null),
      typeResolver: new FakeTypeResolver(),
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
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Sized.tsx" },
      position: { line: 8, character: 30 },
    });
    expect(result).not.toBeNull();
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(2);
  });
});
