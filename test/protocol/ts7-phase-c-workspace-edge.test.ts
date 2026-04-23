import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const itNonWindows = process.platform === "win32" ? it.skip : it;
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

describe("TS 7 Phase C / workspace edge", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  itNonWindows("keeps workspace-folder churn isolated across roots", async () => {
    client = createInProcessServer({
      readStyleFile,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize({
      rootUri: ROOT_A_URI,
      workspaceFolders: [{ uri: ROOT_A_URI, name: "workspace-a" }],
    });
    client.initialized();

    const uriA = `${ROOT_A_URI}/src/App.tsx`;
    client.didOpen({
      textDocument: {
        uri: uriA,
        languageId: "typescriptreact",
        version: 1,
        text: APP_A_TSX,
      },
    });
    expect(await client.waitForDiagnostics(uriA)).toEqual([]);

    client.didChangeWorkspaceFolders({
      event: {
        added: [{ uri: ROOT_B_URI, name: "workspace-b" }],
        removed: [],
      },
    });

    const uriB = `${ROOT_B_URI}/src/App.tsx`;
    client.didOpen({
      textDocument: {
        uri: uriB,
        languageId: "typescriptreact",
        version: 1,
        text: APP_B_TSX,
      },
    });
    expect(await client.waitForDiagnostics(uriB)).toEqual([]);
    await expectDefinitionTarget(
      client,
      uriB,
      APP_B_TSX,
      "beta",
      `${ROOT_B_URI}/src/Button.module.scss`,
    );

    client.didChangeWorkspaceFolders({
      event: {
        added: [],
        removed: [{ uri: ROOT_A_URI, name: "workspace-a" }],
      },
    });

    expect(
      await client.definition({
        textDocument: { uri: uriA },
        position: positionInside(APP_A_TSX, "alpha"),
      }),
    ).toBeNull();
    await expectDefinitionTarget(
      client,
      uriB,
      APP_B_TSX,
      "beta",
      `${ROOT_B_URI}/src/Button.module.scss`,
    );
  });
});

function readStyleFile(path: string): string | null {
  if (path === "/fake/workspace-a/src/Button.module.scss") {
    return ".alpha { color: red; }\n";
  }
  if (path === "/fake/workspace-b/src/Button.module.scss") {
    return ".beta { color: blue; }\n";
  }
  return null;
}

async function expectDefinitionTarget(
  client: LspTestClient,
  uri: string,
  text: string,
  marker: string,
  expectedTargetUri: string,
): Promise<void> {
  const definition = await client.definition({
    textDocument: { uri },
    position: positionInside(text, marker),
  });
  expect(definition).not.toBeNull();
  expect((definition as Array<{ targetUri: string }>)[0]!.targetUri).toBe(expectedTargetUri);
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
