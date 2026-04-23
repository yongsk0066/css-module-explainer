import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const URI = "file:///fake/workspace/src/Button.tsx";

const INITIAL_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('alpha')}>hi</div>;
}
`;

const UPDATED_TSX = INITIAL_TSX.replace("'alpha'", "'beta'");

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
    await expectHoverToContain(client, INITIAL_TSX, "alpha", "color: red;");

    client.didChange({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ text: UPDATED_TSX }],
    });
    expect(await client.waitForDiagnostics(URI)).toEqual([]);
    await expectHoverToContain(client, UPDATED_TSX, "beta", "color: blue;");

    client.didChange({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ text: INITIAL_TSX }],
    });
    expect(await client.waitForDiagnostics(URI)).toEqual([]);
    await expectHoverToContain(client, INITIAL_TSX, "alpha", "color: red;");
  });
});

async function expectHoverToContain(
  client: LspTestClient,
  text: string,
  marker: string,
  expected: string,
): Promise<void> {
  const hover = await client.hover({
    textDocument: { uri: URI },
    position: positionInside(text, marker),
  });
  expect(hover).not.toBeNull();
  expect((hover!.contents as { value: string }).value).toContain(expected);
}

function positionInside(text: string, marker: string): { line: number; character: number } {
  const offset = text.indexOf(marker);
  expect(offset).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, offset + 1);
  const lines = before.split("\n");
  return {
    line: lines.length - 1,
    character: lines.at(-1)!.length - 1,
  };
}
