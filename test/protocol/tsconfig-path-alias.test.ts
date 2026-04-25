import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "../_fixtures/protocol";
import { targetFixture, workspace } from "../../packages/vitest-cme/src";

const TSX_URI = "file:///fake/workspace/src/Some.tsx";
const SCSS_URI = "file:///fake/workspace/src/components/Some.module.scss";

const TSX_WORKSPACE = workspace({
  [TSX_URI]: `import classNames from 'classnames/bind';
import styles from '$components/Some.module.scss';
const cx = classNames.bind(styles);
export default function Some() {
  return <div className={cx('/*|*/something')}>Hello world</div>;
}
`,
});

test("tsconfig paths aliases resolve CSS Module imports across definition and codeLens", async ({
  makeClient,
}) => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "cme-ts-path-"));
  const tsx = TSX_WORKSPACE.file(TSX_URI).content;
  const scss = `.something {\n  display: flex;\n}\n`;

  fs.mkdirSync(path.join(workspacePath, "src/components"), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "$components/*": ["src/components/*"],
          },
        },
      },
      null,
      2,
    ),
  );

  try {
    const client = makeClient({ workspacePath });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: SCSS_URI,
        languageId: "scss",
        version: 1,
        text: scss,
      },
    });
    client.didOpen({
      textDocument: {
        uri: TSX_URI,
        languageId: "typescriptreact",
        version: 1,
        text: tsx,
      },
    });
    await client.waitForDiagnostics(TSX_URI);

    const definition = await client.definition({
      textDocument: { uri: TSX_URI },
      position: targetFixture({ workspace: TSX_WORKSPACE, filePath: TSX_URI }).position,
    });
    expect(definition).not.toBeNull();
    expect(definition).toHaveLength(1);
    const first = definition![0]!;
    expect("targetUri" in first ? first.targetUri : first.uri).toBe(SCSS_URI);

    const lenses = await client.codeLens({
      textDocument: { uri: SCSS_URI },
    });
    expect(lenses).not.toBeNull();
    expect(lenses).toHaveLength(1);
    expect(lenses![0]!.command?.title).toBe("1 reference");
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});
