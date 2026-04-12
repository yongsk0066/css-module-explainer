import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicaror')}>hi</div>;
}
`;

const BUTTON_SCSS = `
.indicator { color: red; }
.active { color: blue; }
`;

describe("diagnostics protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("pushes a warning with a did-you-mean suggestion after a didOpen", async () => {
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
    const diagnostics = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("'.indicaror'");
    // 'indicator' is distance 1 from 'indicaror'
    expect(diagnostics[0]!.message).toContain("Did you mean 'indicator'?");
  });

  it("publishes an empty diagnostic list for a clean document", async () => {
    const CLEAN = BUTTON_TSX.replace("indicaror", "indicator");
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
        text: CLEAN,
      },
    });
    const diagnostics = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(diagnostics).toEqual([]);
  });

  it("uses local flow to diagnose missing class values", async () => {
    const FLOW_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button(enabled: boolean) {
  const size = enabled ? 'indicator' : 'missing';
  return <div className={cx(size)}>hi</div>;
}
`;
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
        text: FLOW_TSX,
      },
    });
    const diagnostics = await client.waitForDiagnostics("file:///fake/workspace/src/Button.tsx");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("Missing class for possible value");
    expect(diagnostics[0]!.message).toContain("'missing'");
  });
});
