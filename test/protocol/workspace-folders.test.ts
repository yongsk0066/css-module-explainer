import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";
import { textDocumentPositionParams, workspace } from "../../packages/vitest-cme/src";
const ROOT_A_URI = "file:///fake/workspace-a";
const ROOT_B_URI = "file:///fake/workspace-b";
const APP_A_URI = `${ROOT_A_URI}/src/App.tsx`;
const APP_B_URI = `${ROOT_B_URI}/src/App.tsx`;
const itNonWindows = process.platform === "win32" ? it.skip : it;

const APP_A_WORKSPACE = workspace({
  [APP_A_URI]: `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function AppA() {
  return <div className={cx('/*|*/alpha')}>a</div>;
}
`,
});

const APP_B_WORKSPACE = workspace({
  [APP_B_URI]: `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function AppB() {
  return <div className={cx('/*|*/beta')}>b</div>;
}
`,
});

const APP_A_TSX = APP_A_WORKSPACE.file(APP_A_URI).content;
const APP_B_TSX = APP_B_WORKSPACE.file(APP_B_URI).content;

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

  itNonWindows("registers a newly added workspace folder", async () => {
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

    client.didOpen({
      textDocument: {
        uri: APP_B_URI,
        languageId: "typescriptreact",
        version: 1,
        text: APP_B_TSX,
      },
    });

    expect(await client.waitForDiagnostics(APP_B_URI)).toEqual([]);
    const definition = await client.definition(
      textDocumentPositionParams({
        workspace: APP_B_WORKSPACE,
        documentUri: APP_B_URI,
        filePath: APP_B_URI,
      }),
    );
    expect(definition).not.toBeNull();
    expect((definition as Array<{ targetUri: string }>)[0]!.targetUri).toBe(
      `${ROOT_B_URI}/src/Button.module.scss`,
    );
  });

  itNonWindows("drops open documents that belong to a removed workspace folder", async () => {
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

    client.didOpen({
      textDocument: {
        uri: APP_A_URI,
        languageId: "typescriptreact",
        version: 1,
        text: APP_A_TSX,
      },
    });

    expect(await client.waitForDiagnostics(APP_A_URI)).toEqual([]);

    client.didChangeWorkspaceFolders({
      event: {
        added: [],
        removed: [{ uri: ROOT_A_URI, name: "a" }],
      },
    });

    expect(await client.waitForDiagnostics(APP_A_URI)).toEqual([]);
    expect(
      await client.definition(
        textDocumentPositionParams({
          workspace: APP_A_WORKSPACE,
          documentUri: APP_A_URI,
          filePath: APP_A_URI,
        }),
      ),
    ).toBeNull();
  });
});
