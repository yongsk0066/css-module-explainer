import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const ROOT_A_URI = "file:///fake/workspace-a";
const ROOT_B_URI = "file:///fake/workspace-b";

const APP_TSX = `import classNames from 'classnames/bind';
import styles from '@styles/Button.module.scss';
const cx = classNames.bind(styles);
export function App() {
  return <div className={cx('button')}>ok</div>;
}
`;

function readStyleFile(path: string): string | null {
  if (path === "/fake/workspace-a/src/styles-a/Button.module.scss") {
    return ".button { color: red; }\n";
  }
  if (path === "/fake/workspace-b/src/styles-b/Button.module.scss") {
    return ".button { color: blue; }\n";
  }
  return null;
}

describe("multi-root pathAlias", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("resolves native pathAlias per workspace folder", async () => {
    client = createInProcessServer({
      readStyleFile,
      typeResolver: new FakeTypeResolver(),
    });
    client.setScopedConfiguration("cssModuleExplainer", ROOT_A_URI, {
      pathAlias: { "@styles": "src/styles-a" },
    });
    client.setScopedConfiguration("cssModuleExplainer", ROOT_B_URI, {
      pathAlias: { "@styles": "src/styles-b" },
    });
    await client.initialize({
      rootUri: ROOT_A_URI,
      workspaceFolders: [
        { uri: ROOT_A_URI, name: "a" },
        { uri: ROOT_B_URI, name: "b" },
      ],
    });
    client.initialized();

    const appAUri = `${ROOT_A_URI}/src/App.tsx`;
    const appBUri = `${ROOT_B_URI}/src/App.tsx`;

    client.didOpen({
      textDocument: {
        uri: appAUri,
        languageId: "typescriptreact",
        version: 1,
        text: APP_TSX,
      },
    });
    client.didOpen({
      textDocument: {
        uri: appBUri,
        languageId: "typescriptreact",
        version: 1,
        text: APP_TSX,
      },
    });

    expect(await client.waitForDiagnostics(appAUri)).toEqual([]);
    expect(await client.waitForDiagnostics(appBUri)).toEqual([]);

    const definitionA = await client.definition({
      textDocument: { uri: appAUri },
      position: { line: 4, character: 30 },
    });
    expect(definitionA).not.toBeNull();
    expect((definitionA as Array<{ targetUri: string }>)[0]!.targetUri).toBe(
      `${ROOT_A_URI}/src/styles-a/Button.module.scss`,
    );

    const definitionB = await client.definition({
      textDocument: { uri: appBUri },
      position: { line: 4, character: 30 },
    });
    expect(definitionB).not.toBeNull();
    expect((definitionB as Array<{ targetUri: string }>)[0]!.targetUri).toBe(
      `${ROOT_B_URI}/src/styles-b/Button.module.scss`,
    );
  });
});
