import { afterEach, describe, expect, it } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server";
import { FakeTypeResolver } from "../_fixtures/fake-type-resolver";

const ROOT_A_URI = "file:///fake/workspace-a";
const ROOT_B_URI = "file:///fake/workspace-b";

const CLSX_TSX = `import clsx from 'clsx';
import styles from './Button.module.scss';
export function Button() {
  return <div className={clsx(styles.fooBar)}>hi</div>;
}
`;

const SCSS = `.foo-bar { color: red; }\n`;

describe("multi-root resource-scoped settings", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("applies classnameTransform per workspace folder", async () => {
    client = createInProcessServer({
      readStyleFile: (path) => (path.endsWith("Button.module.scss") ? SCSS : null),
      typeResolver: new FakeTypeResolver(),
    });
    client.setScopedConfiguration("cssModuleExplainer", ROOT_A_URI, {
      scss: { classnameTransform: "camelCase" },
    });
    client.setScopedConfiguration("cssModuleExplainer", ROOT_B_URI, {
      scss: { classnameTransform: "asIs" },
    });
    await client.initialize({
      rootUri: ROOT_A_URI,
      workspaceFolders: [
        { uri: ROOT_A_URI, name: "a" },
        { uri: ROOT_B_URI, name: "b" },
      ],
    });
    client.initialized();

    const appAUri = `${ROOT_A_URI}/src/Button.tsx`;
    const appBUri = `${ROOT_B_URI}/src/Button.tsx`;

    client.didOpen({
      textDocument: {
        uri: appAUri,
        languageId: "typescriptreact",
        version: 1,
        text: CLSX_TSX,
      },
    });
    client.didOpen({
      textDocument: {
        uri: appBUri,
        languageId: "typescriptreact",
        version: 1,
        text: CLSX_TSX,
      },
    });

    expect(await client.waitForDiagnostics(appAUri)).toEqual([]);
    expect(await client.waitForDiagnostics(appBUri)).toEqual([]);

    const definitionA = await client.definition({
      textDocument: { uri: appAUri },
      position: { line: 3, character: 37 },
    });
    expect(definitionA).not.toBeNull();
    expect((definitionA as Array<{ targetUri: string }>)[0]!.targetUri).toBe(
      `${ROOT_A_URI}/src/Button.module.scss`,
    );

    const definitionB = await client.definition({
      textDocument: { uri: appBUri },
      position: { line: 3, character: 37 },
    });
    expect(definitionB).toBeNull();
  });
});
