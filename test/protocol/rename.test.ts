import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const BUTTON_SCSS = `.indicator { color: red; }
.active { color: blue; }
`;

const APP_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function App() {
  return <div className={cx('indicator')}>hi</div>;
}
`;

describe("rename protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("rename from SCSS selector updates all cx() string literals", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();

    // Open TSX file to populate reverse index.
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/App.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: APP_TSX,
      },
    });
    await client.waitForDiagnostics("file:///fake/workspace/src/App.tsx");

    // Prepare rename on .indicator in SCSS.
    const prep = await client.prepareRename({
      textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
      position: { line: 0, character: 3 }, // inside "indicator"
    });
    expect(prep).not.toBeNull();
    expect(prep!.placeholder).toBe("indicator");

    // Execute rename.
    const edit = await client.rename({
      textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
      position: { line: 0, character: 3 },
      newName: "status",
    });
    expect(edit).not.toBeNull();
    const changes = edit!.changes!;
    // SCSS edit
    expect(changes["file:///fake/workspace/src/Button.module.scss"]).toHaveLength(1);
    // TSX edit
    expect(changes["file:///fake/workspace/src/App.tsx"]).toHaveLength(1);
    expect(changes["file:///fake/workspace/src/App.tsx"]![0]!.newText).toBe("status");
  });

  it("rename from cx('indicator') in TSX updates SCSS selector", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();

    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/App.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: APP_TSX,
      },
    });
    await client.waitForDiagnostics("file:///fake/workspace/src/App.tsx");

    // Prepare rename on 'indicator' inside cx('indicator').
    // Line 4: return <div className={cx('indicator')}>hi</div>;
    // 'indicator' starts at character 28 (after cx(')
    const prep = await client.prepareRename({
      textDocument: { uri: "file:///fake/workspace/src/App.tsx" },
      position: { line: 4, character: 32 }, // inside 'indicator'
    });
    expect(prep).not.toBeNull();
    expect(prep!.placeholder).toBe("indicator");

    const edit = await client.rename({
      textDocument: { uri: "file:///fake/workspace/src/App.tsx" },
      position: { line: 4, character: 32 },
      newName: "status",
    });
    expect(edit).not.toBeNull();
    const changes = edit!.changes!;
    // SCSS edit
    expect(changes["file:///fake/workspace/src/Button.module.scss"]).toHaveLength(1);
    expect(changes["file:///fake/workspace/src/Button.module.scss"]![0]!.newText).toBe("status");
    // TSX edit
    expect(changes["file:///fake/workspace/src/App.tsx"]).toHaveLength(1);
  });

  it("prepareRename returns null for a non-renameable position", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();

    const prep = await client.prepareRename({
      textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
      position: { line: 99, character: 0 },
    });
    expect(prep).toBeNull();
  });

  // End-to-end BEM suffix rename across SCSS + TSX.
  it("rename &-nested BEM suffix rewrites only the suffix in SCSS and the full class in TSX", async () => {
    const BEM_SCSS = `.button {
  padding: 8px;
  &--primary {
    color: white;
  }
}
`;
    const BEM_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function App() {
  return <div className={cx('button--primary')}>hi</div>;
}
`;
    client = createInProcessServer({
      readStyleFile: () => BEM_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();

    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/App.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: BEM_TSX,
      },
    });
    await client.waitForDiagnostics("file:///fake/workspace/src/App.tsx");

    // Cursor on the `&` of `&--primary` at line 2, column 2.
    const cursor = { line: 2, character: 2 };

    // prepareRename: range covers exactly `&--primary` (10 chars),
    // placeholder is the resolved class name.
    const prep = await client.prepareRename({
      textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
      position: cursor,
    });
    expect(prep).not.toBeNull();
    expect(prep!.placeholder).toBe("button--primary");
    expect(prep!.range.start).toEqual({ line: 2, character: 2 });
    expect(prep!.range.end).toEqual({ line: 2, character: 12 });

    // rename: SCSS edit is only `--primary → --tiny` (9 chars).
    // TSX edit is the full `button--primary → button--tiny`.
    const edit = await client.rename({
      textDocument: { uri: "file:///fake/workspace/src/Button.module.scss" },
      position: cursor,
      newName: "button--tiny",
    });
    expect(edit).not.toBeNull();
    const changes = edit!.changes!;

    const scssEdits = changes["file:///fake/workspace/src/Button.module.scss"]!;
    expect(scssEdits).toHaveLength(1);
    expect(scssEdits[0]!.newText).toBe("--tiny");
    expect(scssEdits[0]!.range.start).toEqual({ line: 2, character: 3 });
    expect(scssEdits[0]!.range.end).toEqual({ line: 2, character: 12 });

    const tsxEdits = changes["file:///fake/workspace/src/App.tsx"]!;
    expect(tsxEdits).toHaveLength(1);
    expect(tsxEdits[0]!.newText).toBe("button--tiny");
  });
});
