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
});
