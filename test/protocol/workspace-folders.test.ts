import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const ROOT_A_URI = "file:///fake/workspace-a";
const ROOT_B_URI = "file:///fake/workspace-b";

const APP_A_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function AppA() {
  return <div className={cx('alpha')}>a</div>;
}
`;

const APP_B_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function AppB() {
  return <div className={cx('beta')}>b</div>;
}
`;

function readStyleFile(path: string): string | null {
  if (path === "/fake/workspace-a/src/Button.module.scss") {
    return ".alpha { color: red; }\n";
  }
  if (path === "/fake/workspace-b/src/Button.module.scss") {
    return ".beta { color: blue; }\n";
  }
  return null;
}

describe("workspace folder changes", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("registers a newly added workspace folder", async () => {
    client = createInProcessServer({
      readStyleFile,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize({
      rootUri: ROOT_A_URI,
      workspaceFolders: [{ uri: ROOT_A_URI, name: "a" }],
    });
    client.initialized();

    client.didChangeWorkspaceFolders({
      event: {
        added: [{ uri: ROOT_B_URI, name: "b" }],
        removed: [],
      },
    });

    const tsxUri = `${ROOT_B_URI}/src/App.tsx`;
    client.didOpen({
      textDocument: {
        uri: tsxUri,
        languageId: "typescriptreact",
        version: 1,
        text: APP_B_TSX,
      },
    });

    expect(await client.waitForDiagnostics(tsxUri)).toEqual([]);

    const definition = await client.definition({
      textDocument: { uri: tsxUri },
      position: { line: 4, character: 30 },
    });
    expect(definition).not.toBeNull();
    expect((definition as Array<{ targetUri: string }>)[0]!.targetUri).toBe(
      `${ROOT_B_URI}/src/Button.module.scss`,
    );
  });

  it("drops open documents that belong to a removed workspace folder", async () => {
    client = createInProcessServer({
      readStyleFile,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize({
      rootUri: ROOT_A_URI,
      workspaceFolders: [
        { uri: ROOT_A_URI, name: "a" },
        { uri: ROOT_B_URI, name: "b" },
      ],
    });
    client.initialized();

    const tsxUri = `${ROOT_A_URI}/src/App.tsx`;
    client.didOpen({
      textDocument: {
        uri: tsxUri,
        languageId: "typescriptreact",
        version: 1,
        text: APP_A_TSX,
      },
    });

    expect(await client.waitForDiagnostics(tsxUri)).toEqual([]);

    client.didChangeWorkspaceFolders({
      event: {
        added: [],
        removed: [{ uri: ROOT_A_URI, name: "a" }],
      },
    });

    expect(await client.waitForDiagnostics(tsxUri)).toEqual([]);
    expect(
      await client.definition({
        textDocument: { uri: tsxUri },
        position: { line: 4, character: 30 },
      }),
    ).toBeNull();
  });
});
