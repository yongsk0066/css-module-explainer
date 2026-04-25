import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";
import {
  textDocumentPositionParams,
  workspace,
  type CmeWorkspace,
} from "../../packages/vitest-cme/src";

const URI = "file:///fake/workspace/src/Button.tsx";

const INITIAL_WORKSPACE = workspace({
  [URI]: `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('/*|*/alpha')}>hi</div>;
}
`,
});

const UPDATED_WORKSPACE = workspace({
  [URI]: `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('/*|*/beta')}>hi</div>;
}
`,
});

const INITIAL_TSX = INITIAL_WORKSPACE.file(URI).content;
const UPDATED_TSX = UPDATED_WORKSPACE.file(URI).content;

const STYLE_SCSS = `
.alpha {
  color: red;
}

.beta {
  color: blue;
}
`;

describe("TS 7 Phase C / long-lived LSP session", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("keeps hover and diagnostics stable across repeated edits in one session", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? STYLE_SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();

    client.didOpen({
      textDocument: {
        uri: URI,
        languageId: "typescriptreact",
        version: 1,
        text: INITIAL_TSX,
      },
    });
    expect(await client.waitForDiagnostics(URI)).toEqual([]);
    await expectHoverToContain(client, INITIAL_WORKSPACE, "color: red;");

    client.didChange({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ text: UPDATED_TSX }],
    });
    expect(await client.waitForDiagnostics(URI)).toEqual([]);
    await expectHoverToContain(client, UPDATED_WORKSPACE, "color: blue;");

    client.didChange({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ text: INITIAL_TSX }],
    });
    expect(await client.waitForDiagnostics(URI)).toEqual([]);
    await expectHoverToContain(client, INITIAL_WORKSPACE, "color: red;");
  });
});

async function expectHoverToContain(
  client: LspTestClient,
  source: CmeWorkspace,
  expected: string,
): Promise<void> {
  const hover = await client.hover(
    textDocumentPositionParams({
      workspace: source,
      documentUri: URI,
      filePath: URI,
    }),
  );
  expect(hover).not.toBeNull();
  expect((hover!.contents as { value: string }).value).toContain(expected);
}
